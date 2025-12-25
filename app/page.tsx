'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Session } from '@supabase/supabase-js';
import Link from 'next/link';

type Note = {
  id: string;
  content: string;
  tags: string[] | null;
  created_at: string;
  pinned: boolean;
  favorite: boolean;
  reminder_at: string | null;
  reminder_done: boolean;
};

type Theme = 'neutral' | 'boy' | 'girl';
type Mode = 'write' | 'diary';

type PushSubscriptionJSON = {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

const STOPWORDS = new Set([
  'where',
  'when',
  'what',
  'how',
  'why',
  'did',
  'do',
  'does',
  'is',
  'are',
  'was',
  'were',
  'i',
  'my',
  'the',
  'a',
  'an',
  'to',
  'for',
  'of',
  'in',
  'on',
  'at',
  'last',
  'pay',
  'paid',
  'keep',
  'kept',
  'put',
  'about',
  'tell',
  'me',
]);

function extractKeywords(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w));
}

function matchSearch(note: Note, term: string) {
  if (!term.trim()) return true;
  const t = term.toLowerCase();
  return (
    note.content.toLowerCase().includes(t) ||
    (note.tags || []).some((tag) => tag.toLowerCase().includes(t))
  );
}

function bgClass(theme: Theme) {
  if (theme === 'boy')
    return 'bg-gradient-to-br from-sky-50 via-blue-50 to-emerald-50';
  if (theme === 'girl')
    return 'bg-gradient-to-br from-rose-50 via-pink-50 to-fuchsia-50';
  return 'bg-gradient-to-br from-slate-50 via-slate-100 to-emerald-50/40';
}

function primaryBtn(theme: Theme) {
  if (theme === 'boy') return 'bg-blue-600 hover:bg-blue-700';
  if (theme === 'girl') return 'bg-pink-600 hover:bg-pink-700';
  return 'bg-slate-900 hover:bg-slate-800';
}

function noteBorder(theme: Theme) {
  if (theme === 'boy') return 'border-blue-300';
  if (theme === 'girl') return 'border-pink-300';
  return 'border-emerald-300';
}

/* ---------- STREAK HELPERS ---------- */

function dateKeyLocal(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function calculateStreaks(notes: Note[]): { current: number; longest: number } {
  if (!notes.length) return { current: 0, longest: 0 };

  const daySet = new Set<string>();
  for (const n of notes) {
    const d = new Date(n.created_at);
    daySet.add(dateKeyLocal(d));
  }
  if (daySet.size === 0) return { current: 0, longest: 0 };

  const allDays = Array.from(daySet).sort(); // ascending

  // Longest streak
  let longest = 1;
  let currentRun = 1;
  for (let i = 1; i < allDays.length; i++) {
    const prev = new Date(allDays[i - 1]);
    const curr = new Date(allDays[i]);
    const diff =
      (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
    if (diff === 1) {
      currentRun++;
      if (currentRun > longest) longest = currentRun;
    } else {
      currentRun = 1;
    }
  }

  // Current streak up to today
  let current = 0;
  const today = new Date();
  let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  while (true) {
    const key = dateKeyLocal(cursor);
    if (daySet.has(key)) {
      current++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  return { current, longest };
}

/* ---------- REMINDER HELPERS ---------- */

// Convert ISO string to "YYYY-MM-DDTHH:mm" for <input type="datetime-local">
function toInputDateTime(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// Convert datetime-local value (no timezone) → ISO with timezone (UTC)
function inputToISOString(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function formatReadable(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function reminderStatus(note: Note): 'none' | 'upcoming' | 'due' | 'done' {
  if (!note.reminder_at) return 'none';
  if (note.reminder_done) return 'done';
  const now = new Date().getTime();
  const when = new Date(note.reminder_at).getTime();
  if (Number.isNaN(when)) return 'none';
  return when <= now ? 'due' : 'upcoming';
}

/* ---------- PUSH KEY HELPER ---------- */

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = typeof window === 'undefined' ? '' : window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/* ---------- PAGE COMPONENT ---------- */

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const [theme, setTheme] = useState<Theme | null>(null);
  const [themeLocked, setThemeLocked] = useState(false);
  const [mode, setMode] = useState<Mode>('write');

  const [notes, setNotes] = useState<Note[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);

  const [newContent, setNewContent] = useState('');
  const [newTags, setNewTags] = useState('');
  const [newReminder, setNewReminder] = useState(''); // datetime-local
  const [saving, setSaving] = useState(false);
  const [emailImportant, setEmailImportant] = useState(false);


  const [isRecording, setIsRecording] = useState(false); // 🎙 voice state

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [question, setQuestion] = useState('');
  const [qaResults, setQaResults] = useState<Note[]>([]);
  const [qaMessage, setQaMessage] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [editingTags, setEditingTags] = useState('');
  const [editingReminder, setEditingReminder] = useState(''); // datetime-local
  const [editingSaving, setEditingSaving] = useState(false);

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 5;

  const [hydrated, setHydrated] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);

  // Streaks (computed from notes)
  const { current: currentStreak, longest: longestStreak } = useMemo(
    () => calculateStreaks(notes),
    [notes],
  );

  // Load theme from localStorage on client
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = window.localStorage.getItem('mm_theme');
    if (t === 'neutral' || t === 'boy' || t === 'girl') {
      setTheme(t);
      setThemeLocked(true);
    }
    setHydrated(true);
  }, []);

  const chooseTheme = (t: Theme) => {
    if (themeLocked) return;
    setTheme(t);
    setThemeLocked(true);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('mm_theme', t);
    }
  };

  // Session
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session ?? null);
      setLoading(false);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, newSession) => {
      setSession(newSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Register service worker for PWA + push
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js')
      .then(() => {
        console.log('Memomate service worker registered');
      })
      .catch((err) => {
        console.error('SW registration failed:', err);
      });
  }, []);

  // Detect existing push subscription on this device -> set notificationsEnabled
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          setNotificationsEnabled(true);
        }
      } catch (err) {
        console.error('Error checking existing push subscription', err);
      }
    })();
  }, []);

  // Load notes when logged in
  useEffect(() => {
    if (!session) {
      setNotes([]);
      return;
    }
    fetchNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const fetchNotes = async () => {
    if (!session) return;
    setNotesLoading(true);
    setErrorMsg(null);
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', session.user.id)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) {
      console.error(error);
      setErrorMsg('Failed to load notes.');
    } else {
      const list = (data as Note[]).map((n) => ({
        ...n,
        pinned: !!n.pinned,
        favorite: !!n.favorite,
        reminder_at: n.reminder_at ?? null,
        reminder_done: !!n.reminder_done,
      }));
      setNotes(list);
      setPage(1);
    }
    setNotesLoading(false);
  };

  const handleLogin = async () => {
    if (!theme) return;
    await supabase.auth.signInWithOAuth({ provider: 'google' });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleAddNote = async () => {
    if (!session) return;
    if (!newContent.trim()) {
      setErrorMsg('Please type something to save.');
      return;
    }
    setSaving(true);
    setErrorMsg(null);

    const tagsArray =
      newTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean) || [];

    const reminderValue = inputToISOString(newReminder); // ✅ timezone-safe

    const { data, error } = await supabase
      .from('notes')
      .insert({
        user_id: session.user.id,
        content: newContent.trim(),
        tags: tagsArray,
        reminder_at: reminderValue,
        reminder_done: false,
      })
      .select('*')
      .single();

    if (error) {
      console.error(error);
      setErrorMsg('Could not save note.');
    } else if (data) {
      const note = data as Note;
      setNotes((prev) => [
        {
          ...note,
          pinned: !!note.pinned,
          favorite: !!note.favorite,
          reminder_at: note.reminder_at ?? null,
          reminder_done: !!note.reminder_done,
        },
        ...prev,
      ]);
      setNewContent('');
      setNewTags('');
      setNewReminder('');
    }
    setSaving(false);
  };

  const handleAsk = async () => {
    setQaResults([]);
    setQaMessage(null);
    setAiAnswer(null);
    setAiLoading(false);

    if (!question.trim()) {
      setQaMessage('Type a question first.');
      return;
    }
    if (notes.length === 0) {
      setQaMessage("You don't have any notes yet.");
      return;
    }

    const keywords = extractKeywords(question);
    if (keywords.length === 0) {
      setQaMessage('Try using keywords like "PAN", "bill", "headphones".');
      return;
    }

    const matches = notes.filter((note) => {
      const content = note.content.toLowerCase();
      const tags = (note.tags || []).map((t) => t.toLowerCase());

      return keywords.every(
        (kw) => content.includes(kw) || tags.some((tag) => tag.includes(kw)),
      );
    });

    if (matches.length === 0) {
      setQaMessage('Nothing found in your notes for that.');
      return;
    }

    setQaResults(matches.slice(0, 5));
    setQaMessage(
      `Found ${matches.length} related entr${matches.length === 1 ? 'y' : 'ies'}.`,
    );

    try {
      setAiLoading(true);

      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          notes: matches.slice(0, 10).map((n) => ({
            content: n.content,
            tags: n.tags,
            created_at: n.created_at,
          })),
        }),
      });

      const data = await res.json();
      if (data.answer) {
        setAiAnswer(data.answer);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAiLoading(false);
    }
  };

  const startEdit = (note: Note) => {
    setEditingId(note.id);
    setEditingContent(note.content);
    setEditingTags((note.tags || []).join(', '));
    setEditingReminder(toInputDateTime(note.reminder_at));
    setErrorMsg(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingContent('');
    setEditingTags('');
    setEditingReminder('');
    setEditingSaving(false);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (!editingContent.trim()) {
      setErrorMsg('Note cannot be empty.');
      return;
    }
    setEditingSaving(true);
    setErrorMsg(null);

    const tagsArray =
      editingTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean) || [];

    const reminderValue = inputToISOString(editingReminder); // ✅ timezone-safe

    const { data, error } = await supabase
      .from('notes')
      .update({
        content: editingContent.trim(),
        tags: tagsArray,
        reminder_at: reminderValue,
        reminder_done: false, // reset when editing
      })
      .eq('id', editingId)
      .select('*')
      .single();

    if (error) {
      console.error(error);
      setErrorMsg('Could not update note.');
    } else if (data) {
      const updated = data as Note;
      setNotes((prev) =>
        prev.map((n) =>
          n.id === editingId
            ? {
              ...updated,
              pinned: !!updated.pinned,
              favorite: !!updated.favorite,
              reminder_at: updated.reminder_at ?? null,
              reminder_done: !!updated.reminder_done,
            }
            : n,
        ),
      );
      cancelEdit();
    }
    setEditingSaving(false);
  };

  const deleteNote = async (id: string) => {
    const ok = window.confirm('Delete this entry?');
    if (!ok) return;

    const { error } = await supabase.from('notes').delete().eq('id', id);
    if (error) {
      console.error(error);
      setErrorMsg('Could not delete note.');
      return;
    }
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  const togglePin = async (note: Note) => {
    const { data, error } = await supabase
      .from('notes')
      .update({ pinned: !note.pinned })
      .eq('id', note.id)
      .select('*')
      .single();

    if (error) {
      console.error(error);
      setErrorMsg('Could not update pin.');
      return;
    }

    const updated = data as Note;
    setNotes((prev) =>
      prev
        .map((n) =>
          n.id === note.id
            ? {
              ...updated,
              pinned: !!updated.pinned,
              favorite: !!updated.favorite,
              reminder_at: updated.reminder_at ?? null,
              reminder_done: !!updated.reminder_done,
            }
            : n,
        )
        .sort((a, b) => {
          if (a.pinned === b.pinned) {
            return (
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime()
            );
          }
          return a.pinned ? -1 : 1;
        }),
    );
  };

  const toggleFavorite = async (note: Note) => {
    const { data, error } = await supabase
      .from('notes')
      .update({ favorite: !note.favorite })
      .eq('id', note.id)
      .select('*')
      .single();

    if (error) {
      console.error(error);
      setErrorMsg('Could not update favorite.');
      return;
    }

    const updated = data as Note;
    setNotes((prev) =>
      prev.map((n) =>
        n.id === note.id
          ? {
            ...updated,
            pinned: !!updated.pinned,
            favorite: !!updated.favorite,
            reminder_at: updated.reminder_at ?? null,
            reminder_done: !!updated.reminder_done,
          }
          : n,
      ),
    );
  };

  const markReminderDone = async (note: Note) => {
    if (!note.reminder_at) return;
    const { data, error } = await supabase
      .from('notes')
      .update({ reminder_done: true })
      .eq('id', note.id)
      .select('*')
      .single();

    if (error) {
      console.error(error);
      setErrorMsg('Could not update reminder.');
      return;
    }

    const updated = data as Note;
    setNotes((prev) =>
      prev.map((n) =>
        n.id === note.id
          ? {
            ...updated,
            pinned: !!updated.pinned,
            favorite: !!updated.favorite,
            reminder_at: updated.reminder_at ?? null,
            reminder_done: !!updated.reminder_done,
          }
          : n,
      ),
    );
  };

  /* ---------- VOICE INPUT HANDLER ---------- */
  const handleVoiceInput = () => {
    if (typeof window === 'undefined') return;

    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SR) {
      setErrorMsg('Voice input is not supported in this browser.');
      return;
    }

    const recog = new SR();
    recog.lang = 'en-IN';
    recog.interimResults = false;
    recog.maxAlternatives = 1;

    recog.onstart = () => {
      setIsRecording(true);
      setErrorMsg(null);
    };

    recog.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      setNewContent((prev) => (prev ? prev + ' ' + text : text));
    };

    recog.onerror = (event: any) => {
      console.error('Speech error', event.error);
      setErrorMsg('Voice input error, please try again.');
      setIsRecording(false);
    };

    recog.onend = () => {
      setIsRecording(false);
    };

    try {
      recog.start();
    } catch (e) {
      console.error(e);
      setErrorMsg('Could not start voice input.');
      setIsRecording(false);
    }
  };

  /* ---------- ENABLE / DISABLE NOTIFICATIONS ---------- */

  const enableNotifications = async () => {
    if (typeof window === 'undefined') return;
    if (!session) {
      setErrorMsg('Login first before enabling notifications.');
      return;
    }

    if (!('Notification' in window)) {
      setErrorMsg('Notifications are not supported in this browser.');
      return;
    }
    if (!('serviceWorker' in navigator)) {
      setErrorMsg('Service workers are not supported on this device.');
      return;
    }

    try {
      setNotifLoading(true);
      setErrorMsg(null);

      // 1) Permission
      let permission = Notification.permission;
      if (permission !== 'granted') {
        permission = await Notification.requestPermission();
      }
      if (permission !== 'granted') {
        setErrorMsg(
          'Notifications are blocked in browser settings. Please allow notifications for this site.',
        );
        return;
      }

      // 2) Service worker ready
      const reg = await navigator.serviceWorker.ready;

      // 3) Existing subscription?
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidPublicKey) {
          setErrorMsg('Notifications are not configured on the server (missing VAPID key).');
          return;
        }

        const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

        try {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
          });
        } catch (err: any) {
          console.error('pushManager.subscribe error', err);
          setErrorMsg(
            'Failed to subscribe for push. Check if notifications are allowed for this site in browser settings.',
          );
          return;
        }
      }

      const subJson = sub.toJSON() as PushSubscriptionJSON;

      // 4) Send subscription to backend
      const resp = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subJson,
          userId: session.user.id,
        }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        console.error('subscribe API error', data);
        setErrorMsg('Failed to save notification subscription on server.');
        return;
      }

      // ✅ All good
      setNotificationsEnabled(true);
    } catch (err: any) {
      console.error('enableNotifications error', err);
      setErrorMsg(
        'Failed to enable notifications: ' + (err?.message || 'Unknown error'),
      );
    } finally {
      setNotifLoading(false);
    }
  };

  const disableNotifications = async () => {
    if (typeof window === 'undefined') return;

    try {
      setNotifLoading(true);
      setErrorMsg(null);

      if (!('serviceWorker' in navigator)) {
        setErrorMsg('Service workers are not supported on this device.');
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();

      if (sub) {
        await sub.unsubscribe();
      }

      setNotificationsEnabled(false);
    } catch (err: any) {
      console.error('disableNotifications error', err);
      setErrorMsg(
        'Failed to turn off notifications on this device. You can also disable from browser site settings.',
      );
    } finally {
      setNotifLoading(false);
    }
  };

  // ========= RENDER =========

  if (!hydrated) {
    return null;
  }

  const effectiveTheme: Theme = theme ?? 'neutral';

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-gray-600">Loading…</p>
      </main>
    );
  }

  // NOT LOGGED IN
  if (!session) {
    return (
      <main
        className={`flex min-h-screen items-center justify-center ${bgClass(
          effectiveTheme,
        )}`}
      >
        <div className="bg-white shadow-xl rounded-2xl p-8 max-w-sm w-full text-center border border-slate-200">
          <h1 className="text-3xl font-bold mb-2 tracking-tight text-slate-900">
            Memomate
          </h1>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-700 mb-4">
            your tiny diary brain
          </p>

          <div className="mb-5">
            <p className="text-xs font-semibold text-slate-800 mb-1">
              Step 1 — Choose your vibe
            </p>
            {!themeLocked ? (
              <>
                <p className="text-[11px] text-slate-600 mb-2">
                  This decor is fixed for this device after you choose.
                </p>
                <div className="flex items-center justify-center gap-2 mb-1">
                  <button
                    onClick={() => chooseTheme('boy')}
                    className={`px-3 py-1.5 rounded-full border text-[11px] flex items-center gap-1 ${theme === 'boy'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-800 border-gray-300'
                      }`}
                  >
                    🧢 Boy
                  </button>
                  <button
                    onClick={() => chooseTheme('girl')}
                    className={`px-3 py-1.5 rounded-full border text-[11px] flex items-center gap-1 ${theme === 'girl'
                        ? 'bg-pink-600 text-white border-pink-600'
                        : 'bg-white text-gray-800 border-gray-300'
                      }`}
                  >
                    💖 Girl
                  </button>
                  <button
                    onClick={() => chooseTheme('neutral')}
                    className={`px-3 py-1.5 rounded-full border text-[11px] flex items-center gap-1 ${theme === 'neutral'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-gray-800 border-gray-300'
                      }`}
                  >
                    🌿 Neutral
                  </button>
                </div>
                {!theme && (
                  <p className="text-[10px] text-red-600 mt-1">
                    Please choose one option to continue.
                  </p>
                )}
              </>
            ) : (
              <p className="text-[11px] text-slate-700">
                Theme selected:{' '}
                <span className="font-semibold capitalize">{theme}</span> (fixed
                for this device).
              </p>
            )}
          </div>

          <p className="text-xs font-semibold text-slate-800 mb-1">
            Step 2 — Sign in with Google
          </p>
          <p className="text-[11px] text-slate-600 mb-3">
            Your notes are private, only you can see them.
          </p>
          <button
            onClick={handleLogin}
            disabled={!theme}
            className={`w-full py-2.5 rounded-full text-white text-sm font-medium shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${primaryBtn(
              effectiveTheme,
            )}`}
          >
            Continue with Google
          </button>

          <p className="mt-4 text-[11px] text-slate-600">
            <Link href="/privacy" className="underline">
              Privacy &amp; data safety
            </Link>
          </p>
        </div>
      </main>
    );
  }

  // Filter + paginate
  const baseNotes = showFavoritesOnly ? notes.filter((n) => n.favorite) : notes;
  const filteredNotes = baseNotes.filter((n) => matchSearch(n, searchTerm));
  const totalPages = Math.max(1, Math.ceil(filteredNotes.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pageNotes = filteredNotes.slice(startIndex, startIndex + PAGE_SIZE);

  return (
    <main
      className={`min-h-screen ${bgClass(
        effectiveTheme,
      )} pb-10 overflow-x-hidden text-slate-900`}
    >
      <div className="min-h-screen flex">
        {/* SIDEBAR – tablet / laptop */}
        <aside className="hidden sm:flex sm:flex-col sm:w-64 border-r border-slate-200/70 bg-white/80 backdrop-blur-xl">
          <div className="px-4 py-4 border-b border-slate-200/70">
            <div className="text-lg font-semibold">Memomate</div>
            <div className="text-xs text-slate-600">Your tiny private brain</div>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-2 text-sm">
            <button
              onClick={() => setMode('write')}
              className={`w-full text-left px-3 py-2 rounded-xl transition ${mode === 'write'
                  ? 'bg-slate-900 text-white shadow'
                  : 'text-slate-700 hover:bg-slate-100'
                }`}
            >
              ✍️ Write
            </button>
            <button
              onClick={() => setMode('diary')}
              className={`w-full text-left px-3 py-2 rounded-xl transition ${mode === 'diary'
                  ? 'bg-slate-900 text-white shadow'
                  : 'text-slate-700 hover:bg-slate-100'
                }`}
            >
              📖 Diary
            </button>
            <Link
              href="/privacy"
              className="block w-full text-left px-3 py-2 rounded-xl text-slate-700 hover:bg-slate-100 text-sm"
            >
              🔒 Privacy
            </Link>
          </nav>

          <div className="px-4 py-3 border-t border-slate-200/70 text-xs space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-slate-600">
                Theme:{' '}
                <span className="font-medium capitalize">{theme ?? 'neutral'}</span>
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="truncate max-w-[120px] text-slate-600">
                {session.user.email}
              </span>
              <button
                onClick={handleLogout}
                className="px-3 py-1 rounded-full border border-slate-300 bg-white text-[11px]"
              >
                Logout
              </button>
            </div>
          </div>
        </aside>

        {/* MOBILE TOP BAR */}
        <div className="sm:hidden fixed top-0 inset-x-0 z-20 bg-white/90 backdrop-blur-xl border-b border-slate-200">
          <div className="flex items-center justify-between px-4 py-2.5">
            <div>
              <div className="text-base font-semibold text-slate-900">Memomate</div>
              <div className="text-[11px] text-slate-600">
                Your tiny private brain
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] px-2 py-1 rounded-full border border-slate-300 bg-white text-slate-700">
                {theme ?? 'neutral'}
              </span>
              <button
                onClick={() => setSidebarOpen((v) => !v)}
                className="px-3 py-1 rounded-full border border-slate-300 bg-white text-sm"
              >
                ☰ Menu
              </button>
            </div>
          </div>

          {sidebarOpen && (
            <div className="bg-white border-t border-slate-200 px-3 py-2 space-y-1 text-sm">
              <button
                onClick={() => {
                  setMode('write');
                  setSidebarOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg ${mode === 'write'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                  }`}
              >
                ✍️ Write
              </button>
              <button
                onClick={() => {
                  setMode('diary');
                  setSidebarOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg ${mode === 'diary'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                  }`}
              >
                📖 Diary
              </button>
              <Link
                href="/privacy"
                onClick={() => setSidebarOpen(false)}
                className="block w-full text-left px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-100"
              >
                🔒 Privacy
              </Link>
              <div className="flex items-center justify-between px-2 pt-2 border-t border-slate-200 mt-1 text-[11px] text-slate-600">
                <span className="truncate max-w-[140px]">
                  {session.user.email}
                </span>
                <button
                  onClick={handleLogout}
                  className="px-3 py-1 rounded-full border border-slate-300 bg-white"
                >
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>

        {/* MAIN CONTENT */}
        <div className="flex-1 px-4 sm:px-8 pt-20 sm:pt-8 pb-10 w-full">
          <div className="max-w-3xl mx-auto">
            {/* Heading + streak (desktop) */}
            <div className="mb-4 hidden sm:flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-700">
                  memomate
                </p>
                <h2 className="text-lg font-semibold text-slate-900">
                  Your tiny brain book
                </h2>
              </div>
              <div className="flex flex-col items-end text-[11px]">
                <div className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800">
                  Streak:{' '}
                  <span className="font-semibold">{currentStreak}</span> day
                  {currentStreak === 1 ? '' : 's'} 🔥
                </div>
                <div className="mt-1 text-slate-600">
                  Best:{' '}
                  <span className="font-semibold">{longestStreak}</span> day
                  {longestStreak === 1 ? '' : 's'}
                </div>
              </div>
            </div>

            {errorMsg && (
              <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {errorMsg}
              </div>
            )}

            {/* WRITE MODE */}
            {mode === 'write' && (
              <>
                {/* Ask Memomate */}
                <div className="rounded-2xl border bg-white p-4 mb-4 shadow-sm">
                  <h3 className="text-sm font-semibold mb-1 text-slate-900">
                    Ask Memomate 🧠
                  </h3>
                  <p className="text-xs text-gray-700 mb-3">
                    Ask from your own notes. Example: &quot;Where is my PAN card?&quot;,
                    &quot;When did I pay EB bill?&quot;
                  </p>
                  <div className="flex flex-col md:flex-row gap-2 mb-2">
                    <input
                      className="flex-1 border rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
                      placeholder="Type your question here…"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                    />
                    <button
                      onClick={handleAsk}
                      className={`px-4 py-2 rounded-full text-white text-sm shadow ${primaryBtn(
                        effectiveTheme,
                      )}`}
                    >
                      Ask
                    </button>
                  </div>
                  {qaMessage && (
                    <p className="text-[11px] text-gray-700 mb-2">{qaMessage}</p>
                  )}
                  {qaResults.length > 0 && (
                    <ul className="space-y-2 border-t pt-2 mt-2">
                      {qaResults.map((note) => (
                        <li key={note.id} className="text-sm text-slate-900">
                          <span className="font-semibold text-xs text-slate-600">
                            • Saved:
                          </span>{' '}
                          {note.content}
                        </li>
                      ))}
                    </ul>
                  )}
                  {aiLoading && (
                    <p className="text-xs text-gray-800 mt-2">Thinking…</p>
                  )}

                  {aiAnswer && (
                    <div className="mt-3 p-2 border rounded-lg bg-emerald-50 text-sm text-emerald-900">
                      <strong>Smart answer:</strong> {aiAnswer}
                      <p className="mt-1 text-[11px] text-emerald-900/80">
                        (This answer is only from your own notes. Nothing is taken from
                        the internet.)
                      </p>
                    </div>
                  )}
                </div>

                {/* Add note */}
                <div className="rounded-2xl border bg-white p-4 mb-4 shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-semibold text-slate-900">
                      New diary entry
                    </h3>
                    <button
                      type="button"
                      onClick={handleVoiceInput}
                      className={`text-[11px] px-3 py-1 rounded-full border ${isRecording
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                          : 'border-slate-300 bg-white text-slate-700'
                        }`}
                    >
                      {isRecording ? '🎙 Listening…' : '🎙 Tap to speak'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-700 mb-3">
                    Example: &quot;PAN card is in blue file top drawer&quot; or
                    &quot;AC serviced on 5 Feb, cost 1500&quot;.
                  </p>
                  <textarea
                    className="w-full border rounded-lg px-3 py-2 text-sm mb-2 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
                    rows={3}
                    placeholder="Write something you don't want to forget…"
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                  />
                  <input
                    className="w-full border rounded-lg px-3 py-2 text-xs mb-2 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
                    placeholder="Tags (optional, comma separated, e.g. documents, bills)"
                    value={newTags}
                    onChange={(e) => setNewTags(e.target.value)}
                  />
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-slate-700">
                        Optional reminder
                      </label>
                      <input
                        type="datetime-local"
                        className="border rounded-lg px-3 py-1.5 text-xs bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
                        value={newReminder}
                        onChange={(e) => setNewReminder(e.target.value)}
                      />
                      <span className="text-[10px] text-slate-500">
                        Example: EB bill due date, EMI date, renewal, etc.
                      </span>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={emailImportant}
                          onChange={(e) => setEmailImportant(e.target.checked)}
                        />
                        <span className="text-[11px] text-slate-700">
                          Send email reminder also (for important things)
                        </span>
                      </div>
                      

                    </div>
                  </div>

                  {/* Enable/Disable notifications toggle */}
                  <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <button
                      type="button"
                      onClick={
                        notificationsEnabled
                          ? disableNotifications
                          : enableNotifications
                      }
                      disabled={notifLoading}
                      className="text-[11px] px-3 py-1 rounded-full border border-slate-300 bg-white text-slate-700 disabled:opacity-60"
                    >
                      {notifLoading
                        ? 'Updating…'
                        : notificationsEnabled
                          ? '🔕 Turn off notifications on this device'
                          : '🔔 Enable reminder notifications on this device'}
                    </button>
                    <span className="text-[10px] text-slate-500 text-right">
                      This only affects this device. You can enable or turn off reminders
                      per device anytime.
                    </span>
                  </div>

                  <div className="mt-3 flex justify-between items-center">
                    <button
                      onClick={handleAddNote}
                      disabled={saving}
                      className={`px-4 py-2 rounded-full text-white text-sm disabled:opacity-60 shadow ${primaryBtn(
                        effectiveTheme,
                      )}`}
                    >
                      {saving ? 'Saving…' : 'Save to Memomate'}
                    </button>
                    <span className="text-[11px] text-gray-700">
                      Notes are private, only you can see them.
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* DIARY MODE */}
            {mode === 'diary' && (
              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Your entries{' '}
                      <span className="text-[11px] text-gray-700">
                        ({filteredNotes.length} shown)
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-600">
                      {showFavoritesOnly
                        ? 'Showing only favorites.'
                        : 'Showing all entries.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 text-[11px] overflow-hidden">
                      <button
                        onClick={() => {
                          setShowFavoritesOnly(false);
                          setPage(1);
                        }}
                        className={`px-3 py-1 ${!showFavoritesOnly
                            ? 'bg-white shadow text-slate-900'
                            : 'text-slate-600'
                          }`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => {
                          setShowFavoritesOnly(true);
                          setPage(1);
                        }}
                        className={`px-3 py-1 ${showFavoritesOnly
                            ? 'bg-white shadow text-slate-900'
                            : 'text-slate-600'
                          }`}
                      >
                        ❤️ Favorites
                      </button>
                    </div>
                    <input
                      className="border rounded-lg px-3 py-1.5 text-xs bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
                      placeholder="Search notes…"
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setPage(1);
                      }}
                    />
                    <button
                      onClick={fetchNotes}
                      className="text-[11px] text-gray-700 underline"
                    >
                      Refresh
                    </button>
                  </div>
                </div>

                {notesLoading ? (
                  <p className="text-sm text-gray-700">Loading notes…</p>
                ) : pageNotes.length === 0 ? (
                  <p className="text-sm text-gray-700">
                    No notes match this. Try another search or add new entries in the
                    Write tab.
                  </p>
                ) : (
                  <>
                    <ul className="space-y-3 mb-3">
                      {pageNotes.map((note) => {
                        const isEditing = editingId === note.id;
                        const rStatus = reminderStatus(note);
                        return (
                          <li
                            key={note.id}
                            className={`border ${noteBorder(
                              effectiveTheme,
                            )} rounded-xl px-3 py-2 text-sm shadow-sm bg-white`}
                          >
                            <div className="flex justify-between items-start mb-1 gap-2">
                              <div className="flex flex-col">
                                <span className="text-[11px] text-gray-700">
                                  {new Date(note.created_at).toLocaleString()}
                                </span>
                                {note.pinned && (
                                  <span className="text-[10px] text-amber-700">
                                    📌 Pinned
                                  </span>
                                )}
                              </div>
                              <div className="flex gap-2 text-[11px] items-center">
                                <button
                                  onClick={() => toggleFavorite(note)}
                                  className={
                                    note.favorite
                                      ? 'text-red-600'
                                      : 'text-slate-500 hover:text-red-500'
                                  }
                                  title="Favorite"
                                >
                                  {note.favorite ? '❤️' : '♡'}
                                </button>
                                <button
                                  onClick={() => togglePin(note)}
                                  className={
                                    note.pinned
                                      ? 'text-amber-700'
                                      : 'text-slate-500 hover:text-amber-700'
                                  }
                                  title="Pin on top"
                                >
                                  📌
                                </button>
                                {isEditing ? (
                                  <>
                                    <button
                                      onClick={saveEdit}
                                      disabled={editingSaving}
                                      className="text-emerald-700 font-medium"
                                    >
                                      {editingSaving ? 'Saving…' : 'Save'}
                                    </button>
                                    <button
                                      onClick={cancelEdit}
                                      className="text-gray-600"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => startEdit(note)}
                                      className="text-blue-700"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => deleteNote(note.id)}
                                      className="text-red-600"
                                    >
                                      Delete
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>

                            {isEditing ? (
                              <>
                                <textarea
                                  className="w-full border rounded-lg px-2 py-1 text-sm mb-1 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
                                  rows={2}
                                  value={editingContent}
                                  onChange={(e) =>
                                    setEditingContent(e.target.value)
                                  }
                                />
                                <input
                                  className="w-full border rounded-lg px-2 py-1 text-[11px] mb-1 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
                                  placeholder="Tags (comma separated)"
                                  value={editingTags}
                                  onChange={(e) =>
                                    setEditingTags(e.target.value)
                                  }
                                />
                                <div className="mt-1 flex flex-col gap-1">
                                  <label className="text-[11px] text-slate-700">
                                    Reminder (optional)
                                  </label>
                                  <input
                                    type="datetime-local"
                                    className="border rounded-lg px-2 py-1 text-[11px] bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
                                    value={editingReminder}
                                    onChange={(e) =>
                                      setEditingReminder(e.target.value)
                                    }
                                  />
                                  <span className="text-[10px] text-slate-500">
                                    Clear it to remove reminder.
                                  </span>
                                </div>
                              </>
                            ) : (
                              <>
                                <p className="mb-1 whitespace-pre-wrap text-slate-900">
                                  {note.content}
                                </p>
                                {rStatus !== 'none' && (
                                  <div className="mt-1 flex items-center gap-2 text-[11px]">
                                    {rStatus === 'upcoming' && note.reminder_at && (
                                      <span className="px-2 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-800">
                                        ⏰ Reminder on{' '}
                                        {formatReadable(note.reminder_at)}
                                      </span>
                                    )}
                                    {rStatus === 'due' && note.reminder_at && (
                                      <span className="px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700">
                                        ⏰ Reminder due! ({formatReadable(
                                          note.reminder_at,
                                        )}
                                        )
                                      </span>
                                    )}
                                    {rStatus === 'done' && note.reminder_at && (
                                      <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800">
                                        ✅ Reminder done ({formatReadable(
                                          note.reminder_at,
                                        )}
                                        )
                                      </span>
                                    )}
                                    {rStatus === 'due' && (
                                      <button
                                        onClick={() => markReminderDone(note)}
                                        className="underline text-[11px] text-emerald-700"
                                      >
                                        Mark done
                                      </button>
                                    )}
                                  </div>
                                )}
                              </>
                            )}

                            <div className="flex flex-wrap gap-1 mt-1">
                              {note.tags &&
                                note.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="px-2 py-0.5 text-[10px] rounded-full bg-slate-100 text-slate-800 border border-slate-200"
                                  >
                                    #{tag}
                                  </span>
                                ))}
                            </div>
                          </li>
                        );
                      })}
                    </ul>

                    <div className="flex items-center justify-between text-[11px] text-gray-700">
                      <button
                        disabled={currentPage === 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="px-3 py-1 rounded-full border border-gray-300 disabled:opacity-40 bg-white"
                      >
                        ← Prev page
                      </button>
                      <span>
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        disabled={currentPage === totalPages}
                        onClick={() =>
                          setPage((p) => Math.min(totalPages, p + 1))
                        }
                        className="px-3 py-1 rounded-full border border-gray-300 disabled:opacity-40 bg-white"
                      >
                        Next page →
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

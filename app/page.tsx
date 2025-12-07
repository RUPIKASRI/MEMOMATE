'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Session } from '@supabase/supabase-js';
import Link from 'next/link';

type Note = {
  id: string;
  content: string;
  tags: string[] | null;
  created_at: string;
};

type Theme = 'neutral' | 'boy' | 'girl';
type Mode = 'write' | 'diary';

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

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const [theme, setTheme] = useState<Theme | null>(null);
  const [mode, setMode] = useState<Mode>('write'); // 📝 vs 📖

  const [notes, setNotes] = useState<Note[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);

  const [newContent, setNewContent] = useState('');
  const [newTags, setNewTags] = useState('');
  const [saving, setSaving] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [question, setQuestion] = useState('');
  const [qaResults, setQaResults] = useState<Note[]>([]);
  const [qaMessage, setQaMessage] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [editingTags, setEditingTags] = useState('');
  const [editingSaving, setEditingSaving] = useState(false);

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 5;

  const [hydrated, setHydrated] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Load theme from localStorage on client
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = window.localStorage.getItem('mm_theme');
    if (t === 'neutral' || t === 'boy' || t === 'girl') {
      setTheme(t);
    } else {
      setTheme(null);
    }
    setHydrated(true);
  }, []);

  // Save theme whenever it changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (theme) {
      window.localStorage.setItem('mm_theme', theme);
    }
  }, [theme]);

  const resetTheme = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('mm_theme');
    }
    setTheme(null);
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
      .order('created_at', { ascending: false });
    if (error) {
      console.error(error);
      setErrorMsg('Failed to load notes.');
    } else {
      setNotes((data as Note[]) ?? []);
      setPage(1);
    }
    setNotesLoading(false);
  };

  const handleLogin = async () => {
    if (!theme) return; // extra safety
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

    const { data, error } = await supabase
      .from('notes')
      .insert({
        user_id: session.user.id,
        content: newContent.trim(),
        tags: tagsArray,
      })
      .select('*')
      .single();

    if (error) {
      console.error(error);
      setErrorMsg('Could not save note.');
    } else if (data) {
      setNotes((prev) => [data as Note, ...prev]);
      setNewContent('');
      setNewTags('');
    }
    setSaving(false);
  };

  const handleAsk = async () => {
    // reset previous state
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

      // ALL keywords must match content or tags
      return keywords.every(
        (kw) => content.includes(kw) || tags.some((tag) => tag.includes(kw)),
      );
    });

    if (matches.length === 0) {
      setQaMessage('Nothing found in your notes for that.');
      return;
    }

    // show filtered matches to user
    setQaResults(matches.slice(0, 5));
    setQaMessage(
      `Found ${matches.length} related entr${matches.length === 1 ? 'y' : 'ies'}.`,
    );

    // Ask Gemini to answer only using these filtered notes
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
    setErrorMsg(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingContent('');
    setEditingTags('');
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

    const { data, error } = await supabase
      .from('notes')
      .update({
        content: editingContent.trim(),
        tags: tagsArray,
      })
      .eq('id', editingId)
      .select('*')
      .single();

    if (error) {
      console.error(error);
      setErrorMsg('Could not update note.');
    } else if (data) {
      setNotes((prev) => prev.map((n) => (n.id === editingId ? (data as Note) : n)));
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

  // ========= RENDER =========

  if (!hydrated) {
    // avoid flicker before theme loads
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

  // 🔹 NOT LOGGED IN — SHOW: 1) Theme choice, then 2) Google button
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

          {/* Step 1: Choose theme */}
          <div className="mb-5">
            <p className="text-xs font-semibold text-slate-800 mb-1">
              Step 1 — Choose your vibe
            </p>
            <p className="text-[11px] text-slate-600 mb-2">
              This decor is only for this device. You can change it later.
            </p>
            <div className="flex items-center justify-center gap-2 mb-1">
              <button
                onClick={() => setTheme('boy')}
                className={`px-3 py-1.5 rounded-full border text-[11px] flex items-center gap-1 ${
                  theme === 'boy'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-800 border-gray-300'
                }`}
              >
                🧢 Boy
              </button>
              <button
                onClick={() => setTheme('girl')}
                className={`px-3 py-1.5 rounded-full border text-[11px] flex items-center gap-1 ${
                  theme === 'girl'
                    ? 'bg-pink-600 text-white border-pink-600'
                    : 'bg-white text-gray-800 border-gray-300'
                }`}
              >
                💖 Girl
              </button>
              <button
                onClick={() => setTheme('neutral')}
                className={`px-3 py-1.5 rounded-full border text-[11px] flex items-center gap-1 ${
                  theme === 'neutral'
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
          </div>

          {/* Step 2: Google login */}
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
          {theme && (
            <button
              onClick={resetTheme}
              className="mt-2 text-[11px] text-slate-500 underline"
            >
              Change theme
            </button>
          )}
        </div>
      </main>
    );
  }

  // Filter + paginate for diary mode
  const filteredNotes = notes.filter((n) => matchSearch(n, searchTerm));
  const totalPages = Math.max(1, Math.ceil(filteredNotes.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pageNotes = filteredNotes.slice(startIndex, startIndex + PAGE_SIZE);

  return (
    <main
      className={`min-h-screen ${bgClass(effectiveTheme)} pb-10 overflow-x-hidden text-slate-900`}
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
              className={`w-full text-left px-3 py-2 rounded-xl transition ${
                mode === 'write'
                  ? 'bg-slate-900 text-white shadow'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              ✍️ Write
            </button>
            <button
              onClick={() => setMode('diary')}
              className={`w-full text-left px-3 py-2 rounded-xl transition ${
                mode === 'diary'
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
                <span className="font-medium capitalize">
                  {theme ?? 'neutral'}
                </span>
              </span>
              <button
                onClick={resetTheme}
                className="underline text-slate-700"
              >
                Change
              </button>
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
              <button
                onClick={resetTheme}
                className="text-[11px] px-2 py-1 rounded-full border border-slate-300 bg-white"
              >
                {(theme ?? 'neutral')} 🔁
              </button>
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
                className={`w-full text-left px-3 py-2 rounded-lg ${
                  mode === 'write'
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
                className={`w-full text-left px-3 py-2 rounded-lg ${
                  mode === 'diary'
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
            {/* Small heading */}
            <div className="mb-4 hidden sm:block">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-700">
                memomate
              </p>
              <h2 className="text-lg font-semibold text-slate-900">
                Your tiny brain book
              </h2>
            </div>

            {errorMsg && (
              <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {errorMsg}
              </div>
            )}

            {/* WRITE MODE: Ask + Add */}
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
                      className="flex-1 border rounded-lg px-3 py-2 text-sm bg.white text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
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
                  <h3 className="text-sm font-semibold mb-1 text-slate-900">
                    New diary entry
                  </h3>
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
                  <div className="flex justify-between items-center">
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
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Your entries{' '}
                    <span className="text-[11px] text-gray-700">
                      ({filteredNotes.length} total)
                    </span>
                  </h3>
                  <div className="flex items-center gap-2">
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
                        return (
                          <li
                            key={note.id}
                            className={`border ${noteBorder(
                              effectiveTheme,
                            )} rounded-xl px-3 py-2 text-sm shadow-sm bg-white`}
                          >
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[11px] text-gray-700">
                                {new Date(note.created_at).toLocaleString()}
                              </span>
                              <div className="flex gap-2 text-[11px]">
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
                              </>
                            ) : (
                              <p className="mb-1 whitespace-pre-wrap text-slate-900">
                                {note.content}
                              </p>
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

                    {/* diary-style pagination */}
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

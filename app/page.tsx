'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Session } from '@supabase/supabase-js';

type Note = {
  id: string;
  content: string;
  tags: string[] | null;
  created_at: string;
};

type Theme = 'neutral' | 'boy' | 'girl';
type Mode = 'write' | 'diary';

const STOPWORDS = new Set([
  'where','when','what','how','why','did','do','does','is','are','was','were',
  'i','my','the','a','an','to','for','of','in','on','at','last','pay','paid',
  'keep','kept','put','about','tell','me',
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
  if (theme === 'boy') return 'bg-gradient-to-br from-sky-50 via-blue-50 to-emerald-50';
  if (theme === 'girl') return 'bg-gradient-to-br from-rose-50 via-pink-50 to-fuchsia-50';
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

  const [theme, setTheme] = useState<Theme>('neutral');
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

  // Theme from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = window.localStorage.getItem('mm_theme');
    if (t === 'neutral' || t === 'boy' || t === 'girl') setTheme(t);
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('mm_theme', theme);
  }, [theme]);

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
      // stay in write mode
    }
    setSaving(false);
  };

  const handleAsk = () => {
    setQaResults([]);
    setQaMessage(null);

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
      return keywords.some(
        (kw) => content.includes(kw) || tags.some((tag) => tag.includes(kw)),
      );
    });

    if (matches.length === 0) {
      setQaMessage('Nothing found in your notes for that.');
      return;
    }

    setQaResults(matches.slice(0, 5));
    setQaMessage(`Found ${matches.length} related entr${matches.length === 1 ? 'y' : 'ies'}.`);
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

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-gray-600">Loading…</p>
      </main>
    );
  }

  // Not logged in
  if (!session) {
    return (
      <main className={`flex min-h-screen items-center justify-center ${bgClass(theme)}`}>
        <div className="bg-white shadow-xl rounded-2xl p-8 max-w-sm w-full text-center border border-slate-200">
          <h1 className="text-3xl font-bold mb-2 tracking-tight text-slate-900">Memomate</h1>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-700 mb-4">
            your tiny diary brain
          </p>
          <p className="text-sm text-gray-800 mb-6">
            Save small things (where you kept stuff, what you paid, tiny memories)
            and find them later fast.
          </p>
          <button
            onClick={handleLogin}
            className={`w-full py-2.5 rounded-full text-white text-sm font-medium shadow-md ${primaryBtn(
              theme,
            )}`}
          >
            Continue with Google
          </button>
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
    <main className={`min-h-screen ${bgClass(theme)} pb-10`}>
      {/* solid white so nothing looks blurred */}
      <div className="min-h-screen">


        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b bg-white">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-slate-900">Memomate</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-800">
              diary mode
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* decor toggle */}
            <div className="flex items-center gap-1 text-[11px]">
              <span className="text-gray-700">Decor:</span>
              <button
                onClick={() => setTheme('neutral')}
                className={`px-2 py-0.5 rounded-full border text-[10px] ${
                  theme === 'neutral'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-gray-800 border-gray-300'
                }`}
              >
                Neutral
              </button>
              <button
                onClick={() => setTheme('boy')}
                className={`px-2 py-0.5 rounded-full border text-[10px] ${
                  theme === 'boy'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-800 border-gray-300'
                }`}
              >
                Boy
              </button>
              <button
                onClick={() => setTheme('girl')}
                className={`px-2 py-0.5 rounded-full border text-[10px] ${
                  theme === 'girl'
                    ? 'bg-pink-600 text-white border-pink-600'
                    : 'bg-white text-gray-800 border-gray-300'
                }`}
              >
                Girl
              </button>
            </div>
            <span className="text-xs text-gray-800 max-w-[140px] truncate">
              {session.user.email}
            </span>
            <button
              onClick={handleLogout}
              className="text-xs px-3 py-1 rounded-full border border-gray-300 text-slate-800 bg-white hover:bg-gray-100"
            >
              Logout
            </button>
          </div>
        </header>

        <section className="max-w-4xl mx-auto p-4">
          {/* small top bar with mode toggle */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-slate-800">
                memomate
              </p>
              <h2 className="text-lg font-semibold text-slate-900">
                Your tiny brain book
              </h2>
            </div>
            {/* Write vs Diary toggle */}
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 text-[11px]">
              <button
                onClick={() => setMode('write')}
                className={`px-3 py-1 rounded-full ${
                  mode === 'write' ? 'bg-white shadow text-slate-900' : 'text-slate-600'
                }`}
              >
                📝 Write
              </button>
              <button
                onClick={() => setMode('diary')}
                className={`px-3 py-1 rounded-full ${
                  mode === 'diary' ? 'bg-white shadow text-slate-900' : 'text-slate-600'
                }`}
              >
                📖 Diary
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {errorMsg}
            </div>
          )}

          {/* WRITE MODE: Ask + Add only, no notes here */}
          {mode === 'write' && (
            <>
              {/* Ask Memomate */}
              <div className="rounded-2xl border bg-white p-4 mb-4 shadow-sm">
                <h3 className="text-sm font-semibold mb-1 text-slate-900">
                  Ask Memomate 🧠
                </h3>
                <p className="text-xs text-gray-700 mb-3">
                  Ask from your own notes. Example: "Where is my PAN card?"
                  "When did I pay EB bill?"
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
                      theme,
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
              </div>

              {/* Add note */}
              <div className="rounded-2xl border bg-white p-4 mb-4 shadow-sm">
                <h3 className="text-sm font-semibold mb-1 text-slate-900">
                  New diary entry
                </h3>
                <p className="text-xs text-gray-700 mb-3">
                  Example: "PAN card is in blue file top drawer" or
                  "AC serviced on 5 Feb, cost 1500".
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
                      theme,
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

          {/* DIARY MODE: notes, search, edit, delete, pages */}
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
                  No notes match this. Try another search or add new entries in
                  the Write tab.
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
                            theme,
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
        </section>
      </div>
    </main>
  );
}

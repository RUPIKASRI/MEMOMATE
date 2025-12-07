


export default function PrivacyPage() {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-900">
        <div className="max-w-3xl mx-auto px-4 py-10">
          <h1 className="text-3xl font-bold mb-2">Privacy & Data Safety</h1>
          <p className="text-sm text-slate-700 mb-6">
            Memomate is designed to be your tiny private brain.
            This page explains in simple words how your data is handled.
          </p>
  
          <section className="mb-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <h2 className="text-lg font-semibold mb-2">1. Your notes are private</h2>
            <ul className="list-disc ml-5 text-sm text-slate-800 space-y-1">
              <li>Every note is stored with your unique user ID from Supabase Auth.</li>
              <li>
                We use <strong>Row Level Security (RLS)</strong> so only you can read, edit,
                or delete your notes.
              </li>
              <li>
                Other users cannot see your notes. The app owner cannot see your notes through
                the normal app access.
              </li>
            </ul>
          </section>
  
          <section className="mb-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <h2 className="text-lg font-semibold mb-2">2. How your data is protected</h2>
            <ul className="list-disc ml-5 text-sm text-slate-800 space-y-1">
              <li>Your account is secured using Google login via Supabase Auth.</li>
              <li>
                Only requests with your valid login token can access your notes in the database.
              </li>
              <li>
                Database rules are configured so that even if someone knows a note ID, they still
                cannot access it without being logged in as you.
              </li>
            </ul>
          </section>
  
          <section className="mb-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <h2 className="text-lg font-semibold mb-2">3. What we don&apos;t do</h2>
            <ul className="list-disc ml-5 text-sm text-slate-800 space-y-1">
              <li>We do <strong>not</strong> sell your data.</li>
              <li>We do <strong>not</strong> show ads based on your notes.</li>
              <li>We do <strong>not</strong> share your notes with third parties.</li>
            </ul>
          </section>
  
          <section className="mb-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <h2 className="text-lg font-semibold mb-2">4. Your control</h2>
            <ul className="list-disc ml-5 text-sm text-slate-800 space-y-1">
              <li>You can edit or delete any note at any time from the diary tab.</li>
              <li>
                In the future, we will add an option to download or export your notes for backup.
              </li>
            </ul>
          </section>
  
          <section className="mb-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <h2 className="text-lg font-semibold mb-2">5. Extra privacy tips</h2>
            <ul className="list-disc ml-5 text-sm text-slate-800 space-y-1">
              <li>Avoid storing bank PINs or full passwords directly.</li>
              <li>You can store hints instead of very sensitive information.</li>
            </ul>
          </section>
  
          <p className="text-xs text-slate-500">
            If you ever feel uncomfortable, you can always clear your notes from the diary tab.
          </p>
        </div>
      </main>
    );
  }
  
export default function PrivacyPage() {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-900">
        <div className="max-w-3xl mx-auto px-4 py-10">
          <h1 className="text-3xl font-bold mb-2">Privacy &amp; Data Safety</h1>
          <p className="text-sm text-slate-700 mb-6">
            Memomate is designed to be your tiny private brain. Your notes are personal,
            and we treat them that way.
          </p>
  
          <section className="mb-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <h2 className="text-lg font-semibold mb-2">1. Your notes are private</h2>
            <ul className="list-disc ml-5 text-sm text-slate-800 space-y-1">
              <li>Only you can see your notes when you are logged in.</li>
              <li>Other people cannot view, edit, or delete your notes from their account.</li>
            </ul>
          </section>
  
          <section className="mb-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <h2 className="text-lg font-semibold mb-2">2. How your data is protected</h2>
            <ul className="list-disc ml-5 text-sm text-slate-800 space-y-1">
              <li>You sign in securely using your Google account.</li>
              <li>Your notes are stored in a secure database and linked only to your account.</li>
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
              <li>In the future, you&apos;ll be able to download or export your notes for backup.</li>
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
  
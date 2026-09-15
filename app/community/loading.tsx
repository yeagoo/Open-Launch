export default function CommunityLoading() {
  return (
    <div className="community-preview community-live" lang="en">
      <div className="c-layout">
        <section id="community-content" tabIndex={-1} aria-busy="true">
          <section className="c-state">
            <h1>Loading community…</h1>
            <div className="c-skeleton" aria-label="Loading community content" />
          </section>
        </section>
      </div>
    </div>
  )
}

import React from "react";

const formFields = [
  { label: "Listing title", value: "BuyMeNot Horizon" },
  { label: "Variant ID", value: "RR7-01-EXP" },
  { label: "Status", value: "Editable" },
  { label: "Review state", value: "Pending approval" },
];

const ListingForm = () => (
  <section className="panel">
    <h1>NextGen Listing Editor</h1>
    <p className="muted">Powered by React Router 7 style runtime through Vite middlewareMode.</p>
    <div className="field-grid">
      {formFields.map((field) => (
        <div key={field.label} className="field">
          <span>{field.label}</span>
          <strong>{field.value}</strong>
        </div>
      ))}
    </div>
    <form className="control-form">
      <label>
        Title
        <input defaultValue="BuyMeNot Horizon" />
      </label>
      <label>
        Colorway
        <input defaultValue="Graphite/White" />
      </label>
      <label>
        Release date
        <input type="date" defaultValue="2026-04-15" />
      </label>
      <button type="button">Save draft</button>
    </form>
  </section>
);

const ListingStats = () => (
  <section className="panel">
    <h1>Listing Health</h1>
    <div className="health-grid">
      <div className="health-card">
        <span>Views</span>
        <strong>12,439</strong>
      </div>
      <div className="health-card">
        <span>Favorites</span>
        <strong>246</strong>
      </div>
      <div className="health-card">
        <span>Availability</span>
        <strong>In stock</strong>
      </div>
    </div>
    <button className="link-button">Launch preview</button>
  </section>
);

const App = () => (
  <>
    <header className="app-header">
      <div>
        <span className="brand">BuyMeNot</span>
        <span className="subbrand">NextGen Listing</span>
      </div>
      <nav>
        <a href="#editor">Editor</a>
        <a href="#stats">Stats</a>
      </nav>
    </header>
    <main className="app-shell">
      <div id="editor">
        <ListingForm />
      </div>
      <div id="stats">
        <ListingStats />
      </div>
    </main>
  </>
);

export default App;

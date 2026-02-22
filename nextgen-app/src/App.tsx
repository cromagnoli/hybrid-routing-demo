import React, { useEffect, useState } from "react";

type BootstrapContext = {
  productName?: string;
  simulateFailure?: boolean;
};

declare global {
  interface Window {
    __PDP_CONTEXT__?: BootstrapContext;
  }
}

const DEFAULT_PRODUCT_NAME = "White Loop Runner";

const getBootstrap = (): BootstrapContext => window.__PDP_CONTEXT__ ?? {};

const getInitialProductName = () => {
  const raw = getBootstrap().productName;
  return typeof raw === "string" && raw.trim() ? raw.trim() : DEFAULT_PRODUCT_NAME;
};

const getShouldSimulateFailure = () => getBootstrap().simulateFailure === true;

const postHtmlSnapshot = () => {
  try {
    const html = document.documentElement.outerHTML;
    window.parent.postMessage(
      {
        type: "IFRAME_HTML_SNAPSHOT",
        html,
      },
      "*"
    );
  } catch {
    // noop
  }
};

const redirectToLegacyFromBoundary = () => {
  const url = new URL(window.location.href);
  url.searchParams.set("legacy", "true");
  url.searchParams.set("fallbackReason", "error-boundary");
  url.searchParams.delete("simulateFailure");
  window.location.assign(url.toString());
};

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    redirectToLegacyFromBoundary();
  }

  render() {
    if (this.state.hasError) {
      return null;
    }

    return this.props.children;
  }
}

const CrashTrigger = ({ shouldCrash }: { shouldCrash: boolean }) => {
  if (shouldCrash) {
    throw new Error("Simulated NextGen runtime error");
  }
  return null;
};

const BuyMeNotLogo = () => (
  <div className="logoLockup" aria-label="BuyMeNot logo">
    <div className="logoIso" aria-hidden="true">
      <span className="logoB">B</span>
    </div>
    <div className="logoWordmark">
      <span className="cap">B</span>uy<span className="cap">M</span>e<span className="cap">N</span>ot
    </div>
  </div>
);

const AppContent = () => {
  const [productName, setProductName] = useState(getInitialProductName());
  const [lastUpdate, setLastUpdate] = useState("Loaded from server render");
  const shouldCrash = getShouldSimulateFailure();

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; productName?: string };

      if (data?.type === "REQUEST_HTML_SNAPSHOT") {
        postHtmlSnapshot();
        return;
      }

      if (data?.type !== "PDP_NAME_UPDATE") {
        return;
      }

      const nextName =
        typeof data.productName === "string" && data.productName.trim()
          ? data.productName.trim()
          : DEFAULT_PRODUCT_NAME;

      setProductName(nextName);
      setLastUpdate(`Reactive parent POST at ${new Date().toLocaleTimeString()}`);
    };

    window.addEventListener("message", onMessage);
    postHtmlSnapshot();
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    postHtmlSnapshot();
  }, [productName, lastUpdate]);

  return (
    <div className="page">
      <CrashTrigger shouldCrash={shouldCrash} />
      <header className="header">
        <BuyMeNotLogo />
        <div className="badge">Modern Product Detail</div>
      </header>

      <main className="layout">
        <section className="mediaPanel">
          <img
            className="shoeGraphic"
            src="/images/sneakers-ffffff.png"
            alt="BuyMeNot White Loop Runner"
          />
        </section>

        <section className="infoPanel">
          <p className="eyebrow">BuyMeNot / Product Detail</p>
          <h1>{productName}</h1>
          <p className="subtitle">Minimal everyday sneaker for city use.</p>

          <div className="priceRow">
            <span className="current">$118.00</span>
            <span className="compare">$138.00</span>
          </div>

          <div className="chips">
            <span className="chip active">White</span>
            <span className="chip">Graphite</span>
            <span className="chip">Vivid Green</span>
          </div>

          <div className="metaGrid">
            <div>
              <span>SKU</span>
              <strong>RR7-WHT-0065</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>In stock</strong>
            </div>
            <div>
              <span>Routing</span>
              <strong>React Runtime</strong>
            </div>
            <div>
              <span>Update Mode</span>
              <strong>{lastUpdate}</strong>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

const App = () => (
  <ErrorBoundary>
    <AppContent />
  </ErrorBoundary>
);

export default App;

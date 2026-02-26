import React, { useEffect, useState } from "react";

type BootstrapContext = {
  productName?: string;
  selectedColorCode?: string;
  simulateFailure?: boolean;
};

declare global {
  interface Window {
    __PDP_CONTEXT__?: BootstrapContext;
  }
}

const DEFAULT_PRODUCT_NAME = "White Loop Runner";

const COLOR_OPTIONS = [
  { code: "ffffff", label: "White", imageUrl: "/images/sneakers-ffffff.png" },
  { code: "444444", label: "Graphite", imageUrl: "/images/sneakers-444444.png" },
  { code: "22c55e", label: "Vivid Green", imageUrl: "/images/sneakers-22c55e.png" },
] as const;

const DEFAULT_COLOR_CODE = "ffffff";

const getInitialColorCode = () => {
  const raw = getBootstrap().selectedColorCode;
  return COLOR_OPTIONS.some((option) => option.code === raw)
    ? (raw as (typeof COLOR_OPTIONS)[number]["code"])
    : DEFAULT_COLOR_CODE;
};

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
        href: window.location.href,
      },
      "*"
    );
  } catch {
    // noop
  }
};

const postNavigationStart = () => {
  try {
    window.parent.postMessage({ type: "IFRAME_NAVIGATION_START" }, "*");
  } catch {
    // noop
  }
};

const getCategoryHref = () => {
  const url = new URL(window.location.href);
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 4) {
    return `/cdp/running-sneakers/`;
  }

  const productCategory = segments[1] ?? "running-sneakers";

  const target = new URL(
    `${url.origin}/cdp/${productCategory}/`
  );

  const demoSessionId = url.searchParams.get("demoSessionId");
  if (demoSessionId) {
    target.searchParams.set("demoSessionId", demoSessionId);
  }

  return target.toString();
};

const getCheckoutHref = () => {
  const url = new URL(window.location.href);
  const target = new URL(`${url.origin}/checkout/`);
  const demoSessionId = url.searchParams.get("demoSessionId");
  if (demoSessionId) {
    target.searchParams.set("demoSessionId", demoSessionId);
  }
  return target.toString();
};

const redirectToLegacyFromBoundary = () => {
  const url = new URL(window.location.href);
  url.searchParams.set("legacy", "true");
  url.searchParams.set("fallbackReason", "error-boundary");
  url.searchParams.delete("simulateFailure");
  window.location.assign(url.toString());
};

class RedirectToLegacyErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
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
  const [selectedColorCode, setSelectedColorCode] = useState(getInitialColorCode());
  const [lastUpdate, setLastUpdate] = useState("Loaded from server render");
  const shouldCrash = getShouldSimulateFailure();
  const selectedColor =
    COLOR_OPTIONS.find((option) => option.code === selectedColorCode) ??
    COLOR_OPTIONS[0];

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string };

      if (data?.type === "REQUEST_HTML_SNAPSHOT") {
        postHtmlSnapshot();
      }
    };

    window.addEventListener("message", onMessage);
    postHtmlSnapshot();
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    postHtmlSnapshot();
  }, [productName, lastUpdate, selectedColorCode]);

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
            src={selectedColor.imageUrl}
            alt={`BuyMeNot ${selectedColor.label} Loop Runner`}
          />
        </section>

        <section className="infoPanel">
          <a
            className="backLink"
            href={getCategoryHref()}
            onClick={postNavigationStart}
          >
            Back to product category
          </a>
          <p className="eyebrow">BuyMeNot / Product Detail</p>
          <h1>{productName}</h1>
          <p className="subtitle">Minimal everyday sneaker for city use.</p>

          <div className="priceRow">
            <span className="current">$118.00</span>
            <span className="compare">$138.00</span>
          </div>
          <a className="buyNowButton" href={getCheckoutHref()} onClick={postNavigationStart}>
            Buy now
          </a>

          <div className="chips">
            {COLOR_OPTIONS.map((option) => (
              <button
                key={option.code}
                type="button"
                className={`chip ${
                  option.code === selectedColorCode ? "active" : ""
                }`}
                style={{ ["--swatch-color" as string]: `#${option.code}` }}
                onClick={() => {
                  setSelectedColorCode(option.code);
                  setLastUpdate(
                    `Reactive color selection at ${new Date().toLocaleTimeString()}`
                  );
                }}
              >
                <span className="chipSwatch" aria-hidden="true" />
                {option.label}
              </button>
            ))}
          </div>

          <div className="metaGrid">
            <div>
              <span>SKU</span>
              <strong>RR7-WHT-0065</strong>
            </div>
            <div>
              <span>Color</span>
              <strong>{selectedColor.label}</strong>
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
  <RedirectToLegacyErrorBoundary>
    <AppContent />
  </RedirectToLegacyErrorBoundary>
);

export default App;

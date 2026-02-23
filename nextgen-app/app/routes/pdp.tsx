import React, { useEffect, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";

const DEFAULT_PRODUCT_NAME = "White Loop Runner";
const DEFAULT_COLOR_CODE = "ffffff";

const COLOR_OPTIONS = [
  { code: "ffffff", label: "White", imageUrl: "/images/sneakers-ffffff.png" },
  { code: "444444", label: "Graphite", imageUrl: "/images/sneakers-444444.png" },
  { code: "22c55e", label: "Vivid Green", imageUrl: "/images/sneakers-22c55e.png" },
] as const;

type LoaderData = {
  productName: string;
  selectedColorCode: string;
  simulateFailure: boolean;
};

const resolveSelectedColorCode = (value: unknown) =>
  COLOR_OPTIONS.some((option) => option.code === value)
    ? (value as (typeof COLOR_OPTIONS)[number]["code"])
    : DEFAULT_COLOR_CODE;

export const meta: MetaFunction = () => [
  { title: "BuyMeNot Sneaker Detail (NextGen)" },
];

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const requestUrl = new URL(request.url);
  const productId = params.productId ?? "prod1234";
  const resolveUrl = new URL(`/resolve/${productId}`, requestUrl.origin);
  for (const [key, value] of requestUrl.searchParams.entries()) {
    resolveUrl.searchParams.set(key, value);
  }

  const response = await fetch(resolveUrl.toString());
  if (!response.ok) {
    throw new Error("Failed to resolve product detail");
  }

  const payload = (await response.json()) as {
    productName?: string;
    selectedColorCode?: string;
    simulateFailure?: boolean;
  };

  return {
    productName:
      typeof payload.productName === "string" && payload.productName.trim()
        ? payload.productName.trim()
        : DEFAULT_PRODUCT_NAME,
    selectedColorCode: resolveSelectedColorCode(payload.selectedColorCode),
    simulateFailure: payload.simulateFailure === true,
  } satisfies LoaderData;
};

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
  if (typeof window === "undefined") {
    return "/cdp/running-sneakers/white-loop-runner/prod1234/";
  }

  const url = new URL(window.location.href);
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 4) {
    return `/cdp/running-sneakers/white-loop-runner/prod1234/`;
  }

  const productCategory = segments[1] ?? "running-sneakers";
  const productSlug = segments[2] ?? "white-loop-runner";
  const productId = segments[3] ?? "prod1234";
  const target = new URL(
    `${url.origin}/cdp/${productCategory}/${productSlug}/${productId}/`
  );

  const demoSessionId = url.searchParams.get("demoSessionId");
  if (demoSessionId) {
    target.searchParams.set("demoSessionId", demoSessionId);
  }

  return target.toString();
};

const getCheckoutHref = () => {
  if (typeof window === "undefined") {
    return "/checkout/prod1234/";
  }

  const url = new URL(window.location.href);
  const segments = url.pathname.split("/").filter(Boolean);
  const productId = segments[3] ?? "prod1234";
  const target = new URL(`${url.origin}/checkout/${productId}/`);
  const demoSessionId = url.searchParams.get("demoSessionId");
  if (demoSessionId) {
    target.searchParams.set("demoSessionId", demoSessionId);
  }
  return target.toString();
};

const redirectToLegacyFromBoundary = () => {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set("legacy", "true");
  url.searchParams.set("fallbackReason", "error-boundary");
  url.searchParams.delete("simulateFailure");
  window.location.assign(url.toString());
};

class RouteErrorBoundary extends Error {
  constructor() {
    super("Simulated NextGen runtime error");
    this.name = "RouteErrorBoundary";
  }
}

class RedirectToLegacyBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
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

function CrashTrigger({ shouldCrash }: { shouldCrash: boolean }) {
  if (shouldCrash && typeof window !== "undefined") {
    throw new RouteErrorBoundary();
  }
  return null;
}

function BuyMeNotLogo() {
  return (
    <div className="logoLockup" aria-label="BuyMeNot logo">
      <div className="logoIso" aria-hidden="true">
        <span className="logoB">B</span>
      </div>
      <div className="logoWordmark">
        <span className="cap">B</span>uy<span className="cap">M</span>e
        <span className="cap">N</span>ot
      </div>
    </div>
  );
}

export default function ProductDetailRoute() {
  const data = useLoaderData<typeof loader>();
  const [selectedColorCode, setSelectedColorCode] = useState(data.selectedColorCode);
  const [lastUpdate, setLastUpdate] = useState("Loaded from server render");
  const selectedColor =
    COLOR_OPTIONS.find((option) => option.code === selectedColorCode) ??
    COLOR_OPTIONS[0];

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const payload = event.data as { type?: string };
      if (payload?.type === "REQUEST_HTML_SNAPSHOT") {
        postHtmlSnapshot();
      }
    };
    window.addEventListener("message", onMessage);
    postHtmlSnapshot();
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    postHtmlSnapshot();
  }, [data.productName, selectedColorCode, lastUpdate]);

  return (
    <RedirectToLegacyBoundary>
      <div className="page">
        <CrashTrigger shouldCrash={data.simulateFailure} />
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
            <a className="backLink" href={getCategoryHref()} onClick={postNavigationStart}>
              Back to product category
            </a>
            <p className="eyebrow">BuyMeNot / Product Detail</p>
            <h1>{data.productName}</h1>
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
                  className={`chip ${option.code === selectedColorCode ? "active" : ""}`}
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
    </RedirectToLegacyBoundary>
  );
}

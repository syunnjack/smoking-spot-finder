export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

// 全ページ共通のOGP画像デザイン。next/ogのImageResponseに渡すJSXを組み立てる。
export function OgCard({
  eyebrow,
  heading,
  subheading,
  showLegend = true,
}: {
  eyebrow: string;
  heading: string;
  subheading: string;
  showLegend?: boolean;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "80px",
        background: "linear-gradient(135deg, #4f46e5 0%, #312e81 100%)",
        color: "white",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", fontSize: 32, opacity: 0.8 }}>{eyebrow}</div>
      <div style={{ display: "flex", fontSize: 68, fontWeight: 700, marginTop: 24 }}>{heading}</div>
      <div style={{ display: "flex", fontSize: 36, marginTop: 16, opacity: 0.9 }}>{subheading}</div>
      {showLegend && (
        <div style={{ display: "flex", gap: 32, marginTop: 48 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 24 }}>
            <div style={{ display: "flex", width: 20, height: 20, borderRadius: 10, background: "#22c55e" }} />
            紙タバコOK
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 24 }}>
            <div style={{ display: "flex", width: 20, height: 20, borderRadius: 10, background: "#3b82f6" }} />
            電子タバコ限定
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 24 }}>
            <div style={{ display: "flex", width: 20, height: 20, borderRadius: 10, background: "#eab308" }} />
            店外灰皿あり
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect } from "react";

export default function RegisterServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // 登録に失敗してもアプリ自体は通常通り動作するため、静かに無視する（PWA機能が使えないだけ）。
      });
    }
  }, []);

  return null;
}

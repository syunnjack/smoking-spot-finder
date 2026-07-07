"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "smoking-spot-finder:favorites";

// 店舗のお気に入り（venue.id/place_id単位）をlocalStorageに保存するクライアント専用フック。
// useSyncExternalStoreを使い、SSR時（getServerSnapshot）は空集合、クライアントhydration後は
// 実際のlocalStorageの内容を返すことで、setState-in-effectを使わずにhydrationミスマッチを避ける。
const listeners = new Set<() => void>();

function readFavorites(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

let cachedFavorites: Set<string> | null = null;
// useSyncExternalStoreはgetServerSnapshotの戻り値が呼び出し間で同一参照であることを期待するため、
// 毎回 new Set() を返すと無限ループの警告が出る。固定の空集合を使い回す。
const EMPTY_FAVORITES: Set<string> = new Set();

function getSnapshot(): Set<string> {
  if (!cachedFavorites) {
    cachedFavorites = readFavorites();
  }
  return cachedFavorites;
}

function getServerSnapshot(): Set<string> {
  return EMPTY_FAVORITES;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function writeFavorites(next: Set<string>): void {
  cachedFavorites = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
  } catch {
    // プライベートブラウジング等でlocalStorageが使えない場合は無視する（お気に入りが保存されないだけ）。
  }
  for (const listener of listeners) listener();
}

export function useFavorites() {
  const favorites = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggleFavorite = useCallback((id: string) => {
    const next = new Set(getSnapshot());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    writeFavorites(next);
  }, []);

  const isFavorite = useCallback((id: string) => favorites.has(id), [favorites]);

  return { favorites, toggleFavorite, isFavorite };
}

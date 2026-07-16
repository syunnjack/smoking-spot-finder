import type { Metadata } from "next";
import NagoyaMvpClient from "./NagoyaMvpClient";

export const metadata: Metadata = {
  title: "名古屋駅周辺の便利マップMVP",
  description:
    "名古屋駅周辺の喫煙所、作業できる場所、ランドリー、ジム、サウナ、ゲームセンターを地図とリストで探せるMVPです。",
  alternates: { canonical: "/nagoya" },
};

export default function NagoyaPage() {
  return <NagoyaMvpClient apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY} />;
}

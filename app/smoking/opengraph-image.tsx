import { ImageResponse } from "next/og";
import { OgCard, OG_CONTENT_TYPE, OG_SIZE } from "@/app/ogImageCard";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return new ImageResponse(
    (
      <OgCard
        eyebrow="喫煙所ファインダー"
        heading="静岡駅 喫煙所マップ"
        subheading="半径1000m以内のコンビニ・飲食店の口コミをAIが解析"
      />
    ),
    { ...size }
  );
}

import { requireCapability } from "@/lib/rbac";
import VideoLibrary from "./VideoLibrary";

export default async function VideosPage() {
  await requireCapability("videoLibrary");
  return (
    <div>
      <p className="eyebrow">Biblioteca</p>
      <h1 style={{ marginTop: 0 }}>Vídeos</h1>
      <VideoLibrary />
    </div>
  );
}

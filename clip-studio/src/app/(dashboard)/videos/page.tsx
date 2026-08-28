import { requireCapability } from "@/lib/rbac";
import VideoLibrary from "./VideoLibrary";

export default async function VideosPage() {
  await requireCapability("videoLibrary");
  return <VideoLibrary />;
}

import { DataPreload } from "@/components/DataPreload";
import { GlobePage } from "@/components/GlobePage";

export const metadata = { title: "Live globe · Emberline" };

export default function Page() {
  return <><DataPreload files={["live.json", "tle.json"]} /><GlobePage /></>;
}

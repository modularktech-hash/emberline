import { DataPreload } from "@/components/DataPreload";
import { TrendsPage } from "@/components/TrendsPage";

export const metadata = { title: "Season shift · Emberline" };

export default function Page() {
  return <><DataPreload files={["slices/season_trends.json", "slices/season/Chile.json", "countries.json"]} /><TrendsPage /></>;
}

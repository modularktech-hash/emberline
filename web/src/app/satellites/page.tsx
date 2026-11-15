import { DataPreload } from "@/components/DataPreload";
import { SatellitesPage } from "@/components/SatellitesPage";

export const metadata = { title: "Satellites · Emberline" };

export default function Page() {
  return <><DataPreload files={["tle.json", "drift.json"]} /><SatellitesPage /></>;
}

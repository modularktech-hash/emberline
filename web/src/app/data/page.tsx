import { DataPreload } from "@/components/DataPreload";
import { DataPage } from "@/components/DataPage";

export const metadata = { title: "Data · Emberline" };

export default function Page() {
  return <><DataPreload files={["countries.json", "slices/params_core.json", "coverage_status.json"]} /><DataPage /></>;
}

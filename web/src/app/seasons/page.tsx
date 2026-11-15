import { DataPreload } from "@/components/DataPreload";
import { Seasons } from "@/components/Seasons";

export default function Page() {
  return <><DataPreload countries={["Canada"]} files={["coverage_status.json"]} /><Seasons /></>;
}

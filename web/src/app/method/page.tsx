import { DataPreload } from "@/components/DataPreload";
import { Method } from "@/components/Method";

export default function Page() {
  return <><DataPreload files={["slices/params_core.json", "params_global.json", "coverage_status.json"]} /><Method /></>;
}

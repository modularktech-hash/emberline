import { DataPreload } from "@/components/DataPreload";
import { Explorer } from "@/components/Explorer";

export const metadata = { title: "Explorer · Emberline" };

export default function Page() {
  return <><DataPreload countries={["Canada"]} files={["coverage_status.json"]} /><Explorer /></>;
}

import { DataPreload } from "@/components/DataPreload";
import { ComparePage } from "@/components/ComparePage";

export const metadata = { title: "Compare · Emberline" };

export default function Page() {
  return <><DataPreload countries={["Canada", "Australia"]} files={["countries.json"]} /><ComparePage /></>;
}

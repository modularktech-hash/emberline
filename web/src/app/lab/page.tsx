import { DataPreload } from "@/components/DataPreload";
import { LabPage } from "@/components/LabPage";

export const metadata = { title: "Lab · Emberline" };

export default function Page() {
  return <><DataPreload /><LabPage /></>;
}

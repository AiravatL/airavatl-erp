import { redirect } from "next/navigation";

export default function LegacySettingsPolicyPage() {
  redirect("/admin/users");
}

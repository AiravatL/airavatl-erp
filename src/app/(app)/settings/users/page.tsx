import { redirect } from "next/navigation";

export default function LegacySettingsUsersPage() {
  redirect("/admin/users");
}


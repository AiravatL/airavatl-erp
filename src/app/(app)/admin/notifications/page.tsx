import { PageHeader } from "@/components/shared/page-header";
import { BroadcastComposer } from "@/components/admin/broadcast-composer";

export default function AdminNotificationsPage() {
  return (
    <div className="px-4 pb-6 sm:px-6">
      <PageHeader
        title="App Notifications"
        description="Send a push notification to consigners or partners"
      />

      <div className="mt-4 max-w-2xl">
        <BroadcastComposer />
      </div>
    </div>
  );
}

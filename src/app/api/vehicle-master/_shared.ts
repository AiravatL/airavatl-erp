import type { VehicleMasterTypeOption } from "@/lib/types";

export interface VehicleMasterRpcRow {
  vehicle_type_id: string;
  vehicle_type: string;
  vehicle_type_active: boolean;
  length_id: string | null;
  vehicle_length: string | null;
  length_active: boolean | null;
}

export function normalizeVehicleMasterRows(rows: VehicleMasterRpcRow[]): VehicleMasterTypeOption[] {
  const byType = new Map<string, VehicleMasterTypeOption>();

  for (const row of rows) {
    const existing = byType.get(row.vehicle_type_id);
    if (!existing) {
      byType.set(row.vehicle_type_id, {
        id: row.vehicle_type_id,
        name: row.vehicle_type,
        active: row.vehicle_type_active,
        lengths:
          row.length_id && row.vehicle_length
            ? [
                {
                  id: row.length_id,
                  value: row.vehicle_length,
                  active: Boolean(row.length_active),
                },
              ]
            : [],
      });
      continue;
    }

    if (row.length_id && row.vehicle_length) {
      existing.lengths.push({
        id: row.length_id,
        value: row.vehicle_length,
        active: Boolean(row.length_active),
      });
    }
  }

  return Array.from(byType.values());
}

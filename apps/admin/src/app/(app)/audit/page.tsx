import { AuditLogPage } from "@/components/audit/audit-log-page";
import { PermissionGate } from "@/components/auth/permission-gate";

type Raw = string | string[] | undefined;
const first = (value: Raw): string => ((Array.isArray(value) ? value[0] : value) ?? "").trim();

export default async function AuditRoute({
  searchParams,
}: {
  searchParams: Promise<{ entity?: Raw; entityId?: Raw }>;
}) {
  const params = await searchParams;
  const entity = first(params.entity);
  const entityId = first(params.entityId);
  // ?entity=&entityId= ເປັນຄ່າເລີ່ມຕົ້ນຂອງ filter (ເຊັ່ນ ລິ້ງ "ປະຫວັດ" ຈາກໜ້າບິນ); key ໃຫ້ remount ເມື່ອ URL ປ່ຽນ
  return (
    <PermissionGate permission="staff:read">
      <AuditLogPage key={`${entity}|${entityId}`} initialEntity={entity} initialEntityId={entityId} />
    </PermissionGate>
  );
}

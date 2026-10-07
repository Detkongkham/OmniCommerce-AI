"use client";

import { ACTIONS, MODULES, PERMISSIONS, type Permission, type PermissionModule } from "@oca/shared";
import { Checkbox, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@oca/ui";
import { useT } from "@/lib/i18n/language-provider";

export interface PermissionMatrixProps {
  value: Permission[];
  onChange: (next: Permission[]) => void;
  disabled?: boolean;
}

function permissionsOf(module: PermissionModule): Permission[] {
  return ACTIONS.map((action) => `${module}:${action}` as const);
}

/** Matrix ໂມດູນ × (ເບິ່ງ/ແກ້ໄຂ/ທັງໝົດ). ແຫຼ່ງຂໍ້ມູນສິດຄື @oca/shared; API ບັງຄັບສິດຈິງ. */
export function PermissionMatrix({ value, onChange, disabled = false }: PermissionMatrixProps) {
  const { t } = useT();
  const granted = new Set<Permission>(value);

  function commit(next: Set<Permission>) {
    onChange(PERMISSIONS.filter((permission) => next.has(permission)));
  }

  function toggle(permissions: Permission[], checked: boolean) {
    const next = new Set(granted);
    for (const permission of permissions) {
      if (checked) next.add(permission);
      else next.delete(permission);
    }
    commit(next);
  }

  return (
    <div className="max-h-[40vh] overflow-y-auto rounded-xl border border-line">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t("perm.module")}</TableHead>
            <TableHead className="text-center">{t("perm.read")}</TableHead>
            <TableHead className="text-center">{t("perm.write")}</TableHead>
            <TableHead className="text-center">{t("perm.all")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MODULES.map((module) => {
            const label = t(`module.${module}`);
            const [read, write] = permissionsOf(module) as [Permission, Permission];
            const count = [read, write].filter((permission) => granted.has(permission)).length;
            return (
              <TableRow key={module}>
                <TableCell className="py-2 font-medium text-ink">{label}</TableCell>
                {([read, write] as const).map((permission, index) => (
                  <TableCell key={permission} className="py-2 text-center">
                    <Checkbox
                      aria-label={`${label} - ${index === 0 ? t("perm.read") : t("perm.write")}`}
                      checked={granted.has(permission)}
                      disabled={disabled}
                      onCheckedChange={(checked) => toggle([permission], checked === true)}
                    />
                  </TableCell>
                ))}
                <TableCell className="py-2 text-center">
                  <Checkbox
                    aria-label={`${label} - ${t("perm.all")}`}
                    checked={count === 2 ? true : count === 0 ? false : "indeterminate"}
                    disabled={disabled}
                    onCheckedChange={(checked) => toggle([read, write], checked === true)}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

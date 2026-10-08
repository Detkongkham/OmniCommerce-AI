import { notFound } from "next/navigation";
import { PermissionGate } from "@/components/auth/permission-gate";
import { PostForm } from "@/components/posts/post-form";

/** id ເປັນ cuid; ຮູບອື່ນບໍ່ມີທາງມີຢູ່ ຈຶ່ງ 404 ໂດຍບໍ່ຍິງ API */
const POST_ID = /^[A-Za-z0-9_-]{1,64}$/;

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!POST_ID.test(id)) notFound();
  return (
    <PermissionGate permission="posting:read">
      {/* key = id: ໄປໂພສອື່ນແລ້ວ state ເກົ່າບໍ່ຕິດໄປ */}
      <PostForm key={id} id={id} />
    </PermissionGate>
  );
}

import { PermissionGate } from "@/components/auth/permission-gate";
import { PostForm } from "@/components/posts/post-form";

export default function NewPostPage() {
  return (
    <PermissionGate permission="posting:write">
      <PostForm id={null} />
    </PermissionGate>
  );
}

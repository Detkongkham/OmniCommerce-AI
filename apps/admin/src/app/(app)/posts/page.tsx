import { PermissionGate } from "@/components/auth/permission-gate";
import { PostList } from "@/components/posts/post-list";

export default function PostsRoute() {
  return (
    <PermissionGate permission="posting:read">
      <PostList />
    </PermissionGate>
  );
}

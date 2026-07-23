import { useEffect } from "react";
import { redirectToPublicHome } from "../utils/publicHome";

export default function ForbiddenPage() {
  useEffect(() => {
    redirectToPublicHome();
  }, []);

  return null;
}

import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <p className="text-5xl font-bold">404</p>
      <p className="text-muted">This page could not be found.</p>
      <Link to="/">
        <Button variant="outline">Back home</Button>
      </Link>
    </div>
  );
}

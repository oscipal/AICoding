"""Local dev server with no-cache headers so data files are always fresh."""
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        super().end_headers()

os.chdir(os.path.join(os.path.dirname(__file__), "docs"))
print(f"Serving docs/ at http://localhost:{PORT}  (no-cache)")
http.server.HTTPServer(("", PORT), NoCacheHandler).serve_forever()

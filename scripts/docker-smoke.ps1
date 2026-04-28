$ErrorActionPreference = "Stop"

docker compose up --build -d

try {
  $backend = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing -TimeoutSec 20
  if ($backend.StatusCode -ne 200) { throw "Backend health returned $($backend.StatusCode)" }

  $worker = Invoke-WebRequest -Uri "http://localhost:5001/health" -UseBasicParsing -TimeoutSec 20
  if ($worker.StatusCode -ne 200) { throw "Worker health returned $($worker.StatusCode)" }

  $frontend = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 20
  if ($frontend.StatusCode -ne 200) { throw "Frontend returned $($frontend.StatusCode)" }

  Write-Output "Docker smoke test passed."
}
finally {
  docker compose down
}

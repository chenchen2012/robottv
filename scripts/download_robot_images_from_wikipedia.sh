#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p images/robots
LOG_FILE="images/robots/download-log.txt"
: > "$LOG_FILE"

fetch_thumb() {
  local page="$1"
  local out="$2"
  local api="https://en.wikipedia.org/api/rest_v1/page/summary/${page}"

  local json
  json="$(curl -fsSL "$api" || true)"
  if [[ -z "$json" ]]; then
    echo "MISS_API $page" >> "$LOG_FILE"
    return 0
  fi

  local thumb_url
  thumb_url="$(printf "%s" "$json" | sed -n 's/.*"thumbnail":{[^}]*"source":"\([^"]*\)".*/\1/p' | sed 's#\\/#/#g' | head -n1)"
  if [[ -z "$thumb_url" ]]; then
    echo "NO_THUMB $page" >> "$LOG_FILE"
    return 0
  fi

  if curl -fsSL "$thumb_url" -o "images/robots/$out"; then
    echo "OK $out <- $page" >> "$LOG_FILE"
  else
    echo "FAIL_DL $page" >> "$LOG_FILE"
  fi
}

# Page title -> output filename
fetch_thumb "Optimus_(robot)" "tesla-optimus.jpg"
fetch_thumb "Figure_02" "figure-02.jpg"
fetch_thumb "GR-2" "fourier-gr2.jpg"
fetch_thumb "Unitree_H1" "unitree-h1.jpg"
fetch_thumb "UBTECH_Robotics" "ubtech-walker.jpg"
fetch_thumb "CyberOne" "xiaomi-cyberone.jpg"
fetch_thumb "HRP-5P" "aist-hrp-5-p.jpg"
fetch_thumb "Toyota_T-HR3" "toyota-thr3-alt.jpg"
fetch_thumb "Unitree_B2" "unitree-b2.jpg"
fetch_thumb "Unitree_Go2" "unitree-go2.jpg"
fetch_thumb "Unitree_Go1" "unitree-go1.jpg"
fetch_thumb "Boston_Dynamics_Stretch" "boston-dynamics-stretch.jpg"
fetch_thumb "Mobile_industrial_robot" "mir-amr.jpg"
fetch_thumb "Autonomous_mobile_robot" "fetch-amr.jpg"
fetch_thumb "OTTO_Motors" "otto-amr.jpg"
fetch_thumb "Universal_Robots" "universal-robots-ur20.jpg"
fetch_thumb "FANUC" "fanuc-crx.jpg"
fetch_thumb "KUKA" "kuka-lbr-iiwa.jpg"

echo "Done. Results logged to $LOG_FILE"

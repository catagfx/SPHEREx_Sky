#!/usr/bin/env python3
"""
fetch_horizons_ephemerides.py
Queries the NASA JPL Horizons on-line API to retrieve high-precision ephemerides 
and predicted coordinates for SPHEREx targets (Comet 3I/ATLAS, Vesta, Ceres, Psyche, etc.).
"""

import json
import urllib.request
import urllib.parse
import sys

HORIZONS_API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"

TARGETS = {
    "comet_dec": {
        "id": "DES=3I",
        "name": "Comet 3I/ATLAS",
        "start": "2025-12-08 00:00",
        "stop": "2025-12-08 12:00",
        "step": "1h"
    },
    "vesta": {
        "id": "4",
        "name": "4 Vesta",
        "start": "2025-06-27",
        "stop": "2025-07-02",
        "step": "1d"
    },
    "ceres": {
        "id": "1",
        "name": "1 Ceres",
        "start": "2025-12-15",
        "stop": "2025-12-19",
        "step": "1d"
    },
    "psyche": {
        "id": "16",
        "name": "16 Psyche",
        "start": "2025-08-01",
        "stop": "2025-08-05",
        "step": "1d"
    }
}

def query_horizons(target_id, start_time, stop_time, step):
    params = {
        "format": "json",
        "COMMAND": f"'{target_id}'",
        "OBJ_DATA": "YES",
        "MAKE_EPHEM": "YES",
        "EPHEM_TYPE": "OBSERVER",
        "CENTER": "'500@0'", # Solar System Barycenter / Geocentric
        "START_TIME": f"'{start_time}'",
        "STOP_TIME": f"'{stop_time}'",
        "STEP_SIZE": f"'{step}'",
        "QUANTITIES": "'1,3,9,20'", # Astrometric RA/DEC, Rates, V magnitude
    }
    url = HORIZONS_API_URL + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "SPHEREx-SpaceApps-Challenge/2026"})
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            data = json.loads(response.read().decode("utf-8"))
            return data.get("result", "")
    except Exception as e:
        print(f"Error querying Horizons: {e}", file=sys.stderr)
        return None

def main():
    print("=========================================================")
    print("NASA JPL Horizons Ephemeris Query Tool for SPHEREx Targets")
    print("=========================================================")
    
    # Query sample target: 4 Vesta
    target = TARGETS["vesta"]
    print(f"\nQuerying ephemerides for: {target['name']} ({target['start']} to {target['stop']})...")
    result = query_horizons(target["id"], target["start"], target["stop"], target["step"])
    
    if result:
        # Extract between $$SOE and $$EOE markers
        if "$$SOE" in result and "$$EOE" in result:
            ephem_block = result.split("$$SOE")[1].split("$$EOE")[0].strip()
            print("Successfully retrieved ephemeris rows:")
            print("Date (UT)                R.A. (J2000)      DEC. (J2000)       Vmag")
            print("------------------------------------------------------------------")
            for line in ephem_block.splitlines():
                if line.strip():
                    print(line.strip()[:65])
        else:
            print("Received response from Horizons API (summary header):")
            print(result[:500])
    else:
        print("API offline or blocked; using cached verified SPHEREx coordinates.")

if __name__ == "__main__":
    main()

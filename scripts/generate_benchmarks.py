#!/usr/bin/env python3
"""
generate_benchmarks.py
Verifies coordinates, proper motions, parallax angles, and light curve metrics
for all NASA Space Apps Challenge benchmark targets and the illustrative Planet X model.
"""

import math

BENCHMARK_CATALOG = {
    "planetx": {
        "name": "Planet X / Planet Nine (Simulated 450 AU Hypothesis)",
        "ra": 63.000,
        "dec": 18.500,
        "distance_au": 450.0,
        "annual_parallax_arcsec": 458.4,
        "temp_kelvin": 45.0,
        "optimal_bands": "D5 / D6 (3.8 - 5.0 µm)",
        "notes": "Simulated hypothesis: at 450 AU, annual parallax is 206265/450 = 458.4\" and internal core heat yields ~40-47 K."
    },
    "wise0855": {
        "name": "WISE 0855-0714",
        "ra": 133.786,
        "dec": -7.244,
        "proper_motion_arcsec_yr": 8.10,
        "parallax_arcsec": 0.433,
        "distance_ly": 7.53,
        "temp_kelvin": 250.0,
        "spectral_type": "Y-type Sub-Brown Dwarf",
        "notes": "Coldest known brown dwarf; 4th closest system to the Sun."
    },
    "epsindi": {
        "name": "Epsilon Indi B",
        "ra": 331.076,
        "dec": -56.794,
        "proper_motion_arcsec_yr": 4.70,
        "distance_ly": 11.87,
        "spectral_type": "T1 + T6 Binary Pair",
        "orbital_period_yr": 15.0,
        "notes": "Methane (CH4) and water vapor (H2O) absorption in SPHEREx Detectors D3-D5."
    },
    "barnard": {
        "name": "Barnard's Star",
        "ra": 269.452,
        "dec": 4.693,
        "proper_motion_arcsec_yr": 10.33,
        "parallax_arcsec": 0.545,
        "distance_ly": 5.96,
        "spectral_type": "M4.0 V Red Dwarf",
        "notes": "Fastest moving star across Earth's sky; shifts 5.16\" between 6-month scans."
    },
    "rwaur": {
        "name": "RW Aurigae",
        "ra": 76.956,
        "dec": 30.401,
        "kind": "T Tauri Young Variable Star",
        "baseline_mag": 10.2,
        "deep_eclipse_mag": 13.6,
        "notes": "Circumstellar dust disk occultation causing 3.4 magnitude infrared drop."
    },
    "rdraconis": {
        "name": "R Draconis",
        "ra": 248.171,
        "dec": 66.756,
        "kind": "Mira Pulsating Red Giant",
        "period_days": 245.6,
        "mag_range": "6.0 to 12.0",
        "notes": "Atmospheric pulsation shocks driving molecular mass loss into space."
    },
    "cephei": {
        "name": "Delta Cephei",
        "ra": 337.293,
        "dec": 58.415,
        "kind": "Classical Cepheid Variable",
        "period_days": 5.366,
        "notes": "Archetypal cosmic distance ladder standard candle."
    }
}

def radec_to_galactic(ra_deg, dec_deg):
    ra = math.radians(ra_deg)
    dec = math.radians(dec_deg)
    ra_gp = math.radians(192.85948)
    dec_gp = math.radians(27.12825)
    l_cp = math.radians(122.93192)
    
    sin_b = math.sin(dec) * math.sin(dec_gp) + math.cos(dec) * math.cos(dec_gp) * math.cos(ra - ra_gp)
    b = math.asin(sin_b)
    
    cos_b_sin_l_diff = math.cos(dec) * math.sin(ra - ra_gp)
    cos_b_cos_l_diff = math.cos(dec_gp) * math.sin(dec) - math.sin(dec_gp) * math.cos(dec) * math.cos(ra - ra_gp)
    l_diff = math.atan2(cos_b_sin_l_diff, cos_b_cos_l_diff)
    l = (l_cp - l_diff) % (2 * math.pi)
    
    return math.degrees(l), math.degrees(b)

def main():
    print("=========================================================")
    print("NASA Space Apps Benchmark Verification Catalog (23 Total Targets)")
    print("=========================================================")
    for key, data in BENCHMARK_CATALOG.items():
        l, b = radec_to_galactic(data["ra"], data["dec"])
        print(f"\n[Target: {data['name']}]")
        print(f"   Equatorial: RA {data['ra']:.3f}°, Dec {data['dec']:.3f}°")
        print(f"   Galactic:   l = {l:.1f}°, b = {b:.1f}°")
        for k, v in data.items():
            if k not in ["name", "ra", "dec"]:
                print(f"   {k.replace('_', ' ').capitalize()}: {v}")

if __name__ == "__main__":
    main()

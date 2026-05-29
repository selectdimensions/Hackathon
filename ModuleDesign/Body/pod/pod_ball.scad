// pod_ball.scad — parametric "ball" pod enclosure (v0.3-hardware).
//
// Two-hemisphere sealed sphere for an air-droppable / thrown sensor pod
// (TACTICAL_SENSOR_NETWORK_SPEC.md Part 5.3: ~8-10 cm, impact-resistant, sealed).
// This .scad is the source of truth; the printable mesh is a build artifact:
//
//   openscad -o pod_ball.stl -D 'part="both"' pod_ball.scad     # preview both shells
//   openscad -o pod_ball_top.stl    -D 'part="top"'    pod_ball.scad
//   openscad -o pod_ball_bottom.stl -D 'part="bottom"' pod_ball.scad
//
// FDM/SLA-printable now; the same geometry is the basis for the injection-mold
// tool described in MANUFACTURING.md (add draft + adjust wall for IM there).

/* ---- Parameters (mm) ---- */
outer_d        = 90;     // outer diameter (8-10 cm class)
wall           = 3.0;    // shell wall thickness
lip_h          = 6;      // overlap height of the two-shell seam
lip_clear      = 0.25;   // radial clearance at the lip (press/gasket fit)
gasket_groove  = 1.2;    // O-ring/gasket groove depth at the seam
antenna_d      = 6.5;    // SMA bulkhead bore
vent_d         = 5;      // Gore-Tex vent membrane boss bore
gnss_flat_d    = 28;     // diameter of the thinned "sky window" over the GNSS patch
gnss_wall      = 1.4;    // thinned wall under the GNSS window (RF-transparent)
boss_d         = 6;      // internal PCB/battery standoff outer diameter
boss_h         = 8;      // standoff height
$fn            = 96;     // facet count

part = "both";           // "top" | "bottom" | "both"

/* ---- Helpers ---- */
module shell_solid() { sphere(d = outer_d); }
module shell_cavity() { sphere(d = outer_d - 2 * wall); }

module gnss_window() {
  // Thin the top wall to a RF-transparent window for the GNSS patch + sky view.
  translate([0, 0, outer_d/2 - wall])
    cylinder(d1 = gnss_flat_d, d2 = gnss_flat_d * 0.7, h = wall - gnss_wall + 0.01);
}

module antenna_bore() {
  // Equatorial SMA bulkhead for the LoRa antenna(s).
  rotate([0, 90, 0]) translate([0, 0, -outer_d]) cylinder(d = antenna_d, h = 2*outer_d);
}

module vent_bore() {
  // Pressure-equalisation vent (Gore-Tex membrane bonded on the inside).
  rotate([0, 90, 0]) translate([0, 0, -outer_d]) rotate([0,0,0]) {}
  translate([0, 0, -outer_d/2 + wall]) cylinder(d = vent_d, h = wall + 0.02, center=false);
}

module standoffs() {
  // Four internal bosses on the bottom hemisphere floor for the PCB stack.
  for (a = [45 : 90 : 360])
    rotate([0, 0, a]) translate([outer_d/4, 0, -outer_d/2 + wall])
      difference() {
        cylinder(d = boss_d, h = boss_h);
        cylinder(d = 2.2, h = boss_h + 0.1);  // M2 self-tap pilot
      }
}

module shell() {
  difference() {
    shell_solid();
    shell_cavity();
    gnss_window();
    antenna_bore();
    vent_bore();
  }
}

/* ---- Seam: split into top/bottom hemispheres with an interlocking lip ---- */
module bottom_half() {
  intersection() {
    union() { shell(); standoffs(); }
    translate([0, 0, -outer_d]) cube([outer_d*2, outer_d*2, outer_d], center=true)
      ;  // keep z<=0 (lower hemisphere) — cube centered at z=-outer_d/2 region
  }
  // upstanding lip (inner) for the seam overlap + gasket groove
  difference() {
    cylinder(d = outer_d - 2*wall + 2*lip_clear, h = lip_h);
    translate([0,0,-0.1]) cylinder(d = outer_d - 2*wall - 2*wall, h = lip_h + 0.2);
    translate([0,0,lip_h - gasket_groove])
      cylinder(d = outer_d - 2*wall + 2*lip_clear + 0.4, h = gasket_groove + 0.1);
  }
}

module top_half() {
  intersection() {
    shell();
    translate([0, 0, outer_d]) cube([outer_d*2, outer_d*2, outer_d], center=true);
  }
}

/* ---- Render selector ---- */
if (part == "bottom") bottom_half();
else if (part == "top") top_half();
else {
  bottom_half();
  translate([0, 0, outer_d * 1.2]) top_half();  // exploded preview
}

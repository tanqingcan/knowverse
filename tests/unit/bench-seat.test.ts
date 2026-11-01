import {expect,it} from "vitest";
import {BENCH_MODEL_SCALE,SEATED_TRAVELER_SCALE,TRAVELER_SEAT_X,TRAVELER_SEAT_Y,BENCH_SEAT_TOP} from "@/components/world/benchSeat";
it("seated coat clears the bench seat with a stable hip anchor during breathing",()=>{
 const bottom=TRAVELER_SEAT_Y+(.085+.03-.058)*SEATED_TRAVELER_SCALE;
 expect(bottom).toBeGreaterThan(BENCH_SEAT_TOP+.001);
});
it("back and scarf stay in front of the backrest; feet hang past the seat edge",()=>{
 const bodyBack=TRAVELER_SEAT_X-.045*SEATED_TRAVELER_SCALE;
 const backrestFront=(-.04+.006)*BENCH_MODEL_SCALE;
 expect(bodyBack-backrestFront).toBeGreaterThan(.025);
 const footBack=TRAVELER_SEAT_X+(.073-.017*1.35)*SEATED_TRAVELER_SCALE;
 const seatFront=.032*BENCH_MODEL_SCALE;
 expect(footBack).toBeGreaterThan(seatFront);
});

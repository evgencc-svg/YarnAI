"use strict";

// Artificial adult figures only, in cm. All circumferences are full measurements.
const common = {
  units:"cm-full", chest:100, belly:96, hem:98, shoulders:43, upper:31, wrist:17, head:57,
  length:68, bellyHeight:23, depth:24, arm:45, bodyEase:10, bellyEase:10, upperEase:6, wristEase:3,
};
const profiles = [
  ["А · пропорциональная",common],
  ["Б · широкая грудь и плечи",{...common,chest:118,belly:106,hem:104,shoulders:50,upper:37,depth:27,arm:47}],
  ["В · выраженный живот",{...common,belly:120,hem:111,bellyEase:12}],
  ["Г · короткие руки, широкий корпус",{...common,chest:116,belly:115,hem:110,shoulders:48,upper:35,depth:26,arm:33}],
  ["Д · длинные руки, узкий корпус",{...common,chest:88,belly:83,hem:87,shoulders:38,upper:27,depth:21,arm:55}],
];
const gauges = [
  {basis:"label",labelSt:20,labelRows:28,ribSt:24,ribRows:32},
  {basis:"swatch",sampleSt:23,sampleRows:32,ribSt:27,ribRows:36},
];
const sizes = [36,40,44,48,52,56,60].map(n=>n+" in");
module.exports = {profiles,gauges,sizes};

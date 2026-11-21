# COSMIC-1 Ionospheric Profile File: Technical Description

## 1. File overview

This document describes the contents of the supplied NetCDF file:

`ionPrf_C006.2017.250.00.02.G29_2016.1120_nc`

The file is a COSMIC-1 GPS Radio Occultation (RO) ionospheric profile
product distributed with UCAR/CDAAC metadata. It contains a vertical
sequence of geophysical observations associated with the occultation.

  Item                        Value
  --------------------------- -------------------------------------
  Product/file prefix         `ionPrf`
  Mission                     COSMIC
  Data centre                 UCAR/CDAAC
  File stamp                  `C006.2017.250.00.02.G29`
  Observation date            7 September 2017
  Observation time            00:04:00 UTC
  Occultation ID              1
  Occulting satellite ID      29
  Reference satellite ID      0
  Number of profile samples   471
  Vertical coordinate         Mean sea-level altitude (`MSL_alt`)
  Altitude coverage           53.1856 to 833.5591 km

The date and time above are taken from the file attributes (`year`,
`month`, `day`, `hour`, `minute`, and `second`). The file name's `250`
is the day-of-year identifier for 7 September 2017.

## 2. Data structure

The dataset has one dimension, `MSL_alt`, containing 471 samples. Five
one-dimensional data variables are indexed along that dimension.

  -------------------------------------------------------------------------
  Variable          Units             Description in    Interpretation
                                      file              
  ----------------- ----------------- ----------------- -------------------
  `MSL_alt`         km                Mean sea-level    Vertical coordinate
                                      altitude of       for the profile
                                      perigee point     

  `ELEC_dens`       el/cm³            Electron density  Retrieved electron
                                                        density along the
                                                        profile

  `TEC_cal`         TECU              Calibrated        Calibrated
                                      occultation TEC   occultation total
                                      below LEO orbit   electron content
                                                        parameter

  `GEO_lat`         degrees_north     Geographical      Latitude associated
                                      latitude of       with each profile
                                      perigee point     sample

  `GEO_lon`         degrees_east      Geographical      Longitude
                                      longitude of      associated with
                                      perigee point     each profile sample

  `OCC_azi`         degrees           Azimuth angle of  Occultation-plane
                                      occultation plane azimuth
                                      with respect to   
                                      north             
  -------------------------------------------------------------------------

All six variables are one-dimensional arrays with 471 values. `MSL_alt`
is the coordinate; the other five are data variables.

## 3. Profile and variable statistics

The following descriptive statistics were calculated directly from the
arrays in this file. They describe this single occultation only.

  -------------------------------------------------------------------------
  Variable             Minimum        Maximum           Mean         Median
  ------------- -------------- -------------- -------------- --------------
  `MSL_alt`            53.1856       833.5591       489.4488            ---
  (km)                                                       

  `ELEC_dens`      -105,413.31   1,317,506.25     333,680.03     132,420.91
  (el/cm³)                                                   

  `TEC_cal`             1.4150       377.5230       131.0336        68.9574
  (TECU)                                                     

  `GEO_lat`             1.4718        15.0001         9.2646            ---
  (degrees)                                                  

  `GEO_lon`          -149.1353      -140.4661      -143.9608            ---
  (degrees)                                                  

  `OCC_azi`           139.5183       143.0317       141.3929            ---
  (degrees)                                                  
  -------------------------------------------------------------------------

### Electron-density quality note

-   451 of the 471 `ELEC_dens` samples are positive.
-   20 samples are negative.
-   The minimum value is -105,413.31 el/cm³.
-   Negative electron density is not physically meaningful as a measured
    plasma density. These values should be flagged during quality
    control, not silently interpreted as physical values.
-   The maximum value in the profile is 1,317,506.25 el/cm³.

For an initial plot, retain the original values in the raw-data view and
provide a separate quality-controlled view that masks or flags
non-positive electron-density values. Document the chosen rule in any
exported results.

### Calibrated TEC note

`TEC_cal` contains 471 positive values in this file, ranging from 1.4150
to 377.5230 TECU. Its file description specifies calibrated occultation
TEC below the LEO orbit. It should not automatically be treated as a
vertical TEC time series or as a value measured independently at each
altitude without considering the product's definition.

## 4. Key file-level ionospheric metadata

The NetCDF global attributes include the following derived or ancillary
values:

  ------------------------------------------------------------------------
  Attribute                                    Value Units / note
  --------------------- ---------------------------- ---------------------
  `edmax`                             1,317,506.2513 Electron-density
                                                     maximum; el/cm³

  `edmaxalt`                                325.9300 Altitude of maximum
                                                     electron density; km

  `edmaxlat`                                 11.8990 Latitude at
                                                     electron-density
                                                     maximum; degrees

  `edmaxlon`                               -142.3195 Longitude at
                                                     electron-density
                                                     maximum; degrees

  `edmaxaz`                                 142.0774 Azimuth at
                                                     electron-density
                                                     maximum; degrees

  `critfreq`                                 10.3049 Critical frequency;
                                                     MHz

  `tec0`                                     28.7563 TEC metadata
                                                     parameter; TECU

  `tec1`                                      2.2741 TEC metadata
                                                     parameter; TECU

  `smear`                                  1779.7439 Product metadata
                                                     value; consult
                                                     product documentation
                                                     for units and
                                                     interpretation

  `topfit`                                 0.0054577 Product metadata
                                                     value; consult
                                                     product documentation
                                                     for interpretation

  `hscale`                                      -999 Sentinel/fill-like
                                                     metadata value; do
                                                     not interpret as a
                                                     physical scale height
                                                     without product
                                                     documentation
  ------------------------------------------------------------------------

The metadata `edmax` and `edmaxalt` agree with the maximum of the
`ELEC_dens` array and its reported peak altitude. The critical frequency
and TEC attributes are file-level metadata, not additional profile
arrays.

## 5. Occultation path and endpoints

The latitude and longitude arrays describe the geographical
perigee-point location associated with each altitude sample.

  ---------------------------------------------------------------------------
  Endpoint         Sample     Altitude Latitude (°)    Longitude  Azimuth (°)
                                  (km)                       (°) 
  ---------- ------------ ------------ ------------ ------------ ------------
  Bottom                1      53.1856      15.0001    -140.4661     143.0317

  Top                 471     833.5591       1.4718    -149.1353     139.5183
  ---------------------------------------------------------------------------

The latitude decreases from approximately 15.00°N to 1.47°N, while
longitude changes from approximately 140.47°W to 149.14°W across the
profile samples. These are profile/perigee-point coordinates, not a
complete satellite ground track.

## 6. Other global attributes

Selected processing and provenance attributes:

  Attribute         Value
  ----------------- ---------------------------
  `center`          UCAR/CDAAC
  `mission`         COSMIC
  `inverter`        `gmrion`
  `parmsfile`       `parms8`
  `icalib`          1
  `shortlen`        471
  `nmax`            471
  `creation_time`   `01-DEC-17 02:56`
  `fileStamp`       `C006.2017.250.00.02.G29`

The file also contains timing and endpoint metadata, including
`bottime`, `toptime`, `edmaxtime`, and local-time fields. Their
interpretation should follow the relevant COSMIC/CDAAC product
documentation.

## 7. What this file can and cannot show

### Supported directly by this file

-   Electron density as a function of altitude.
-   Calibrated occultation TEC values as stored in `TEC_cal`.
-   Latitude, longitude, and occultation azimuth associated with profile
    samples.
-   The file's reported electron-density maximum, its altitude and
    location.
-   The file-level critical-frequency and TEC metadata.
-   Profile endpoints and processing/provenance metadata.

### Not contained as an ionogram

This file does **not** contain an ionosonde ionogram image or a
frequency-versus-virtual-height ionogram matrix. It is a satellite
radio-occultation ionospheric profile product. It therefore cannot, by
itself, display the characteristic ionosonde echo traces or provide a
full ionogram.

The metadata attribute `critfreq` is not a substitute for an ionogram.
Ground-based ionosonde observations would need to be sourced separately
for ionogram visualization or direct COSMIC--ionosonde comparisons.

## 8. Recommended visualizations

For a scientific dashboard, the following views are appropriate for this
file:

1.  **Electron density profile:** `ELEC_dens` on the x-axis and
    `MSL_alt` on the y-axis. Offer linear and logarithmic x-axis
    options; flag non-positive values when using a logarithmic scale.
2.  **Calibrated TEC profile:** `TEC_cal` against `MSL_alt`, clearly
    labelled as calibrated occultation TEC below LEO orbit.
3.  **Latitude and longitude profiles:** `GEO_lat` and `GEO_lon` against
    altitude.
4.  **Occultation azimuth profile:** `OCC_azi` against altitude.
5.  **Geographical profile view:** map the ordered (`GEO_lon`,
    `GEO_lat`) samples and allow the user to colour points by altitude
    or another selected variable.
6.  **Metadata panel:** display observation time, satellite identifiers,
    `edmax`, `edmaxalt`, `critfreq`, `tec0`, `tec1`, endpoints, and
    processing attributes.
7.  **Data table and export:** show all 471 rows and allow export to
    CSV, retaining units and quality flags.

For multi-file analysis, profiles should be compared only after checking
product version, processing metadata, observation times, coordinate
conventions, and quality-control consistency.

## 9. Suggested quality-control and interpretation workflow

1.  Read the NetCDF variables and global attributes without altering the
    source file.
2.  Check missing values, fill values, valid ranges, and non-finite
    values.
3.  Flag the 20 negative `ELEC_dens` samples found in this file.
4.  Calculate profile statistics and peak values from the data array,
    then compare them with the global attributes.
5.  Plot the raw profile and a clearly identified quality-controlled
    profile.
6.  Preserve the original altitude ordering and the original variable
    values in any exported dataset.
7.  Consult the applicable COSMIC/CDAAC product documentation before
    assigning physical interpretations to ancillary attributes such as
    `smear`, `topfit`, and `hscale`.

## 10. Source and scope

**Source:** The supplied NetCDF file
`ionPrf_C006.2017.250.00.02.G29_2016.1120_nc`.

All file-specific values in this document were read from that file's
variables and global attributes. Descriptive statistics were calculated
from its 471 array samples. No external ionosonde observations or
additional COSMIC files were used.

This document is a technical inventory and visualization guide for one
profile. It is not a validation of the retrieval or a complete
scientific interpretation of the event.

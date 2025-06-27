#include <cmath>

extern "C" {
    double haversine(double lat1, double lon1, double lat2, double lon2) {
        constexpr double R = 6371.0;
        constexpr double toRadians = M_PI / 180.0;

        lat1 *= toRadians;
        lon1 *= toRadians;
        lat2 *= toRadians;
        lon2 *= toRadians;

        double const dlat = lat2 - lat1;
        double const dlon = lon2 - lon1;

        const double a = sin(dlat / 2) * sin(dlat / 2) +
                   cos(lat1) * cos(lat2) *
                   sin(dlon / 2) * sin(dlon / 2);
        const double c = 2 * atan2(sqrt(a), sqrt(1 - a));
        return R * c;
    }
}

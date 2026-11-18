"""Tests for the cloud analysis. Run from the repository root:

    python -m unittest discover -s studio/analysis/tests -t .
"""
import unittest
import numpy as np

from studio.analysis import measure as M
from studio.analysis import metrics as X
from studio.analysis import score as S

SKY = (30, 110, 240)


def canvas(h=200, w=200):
    img = np.zeros((h, w, 3), np.float32)
    img[:] = SKY
    return img


def disc(img, cx, cy, r, colour):
    yy, xx = np.mgrid[:img.shape[0], :img.shape[1]]
    img[(xx - cx) ** 2 + (yy - cy) ** 2 <= r * r] = colour
    return img


class Segmentation(unittest.TestCase):
    def test_cloud_is_found_against_sky(self):
        img = disc(canvas(), 100, 100, 50, (240, 245, 255))
        cloud, sky = M.segment(img)
        self.assertGreater(cloud.sum(), 7000)
        self.assertTrue(sky[0, 0])

    def test_sky_coloured_shadow_inside_the_cloud_is_cloud(self):
        img = disc(canvas(), 100, 100, 60, (240, 245, 255))
        disc(img, 100, 100, 20, SKY)      # a pocket of sky blue, enclosed
        cloud, _ = M.segment(img)
        self.assertTrue(cloud[100, 100])

    def test_whites_a_hair_warm_are_still_cloud(self):
        # Painted whites often come out with red a touch above blue.
        img = disc(canvas(), 100, 100, 50, (252, 250, 247))
        cloud, _ = M.segment(img)
        self.assertTrue(cloud[100, 100])

    def test_holes_do_not_count_as_outline(self):
        mask = disc(canvas(400, 400), 200, 200, 150, (255, 255, 255))[..., 0] > 200
        holed = mask.copy()
        for x in range(120, 280, 20):
            for y in range(120, 280, 20):
                holed[y:y + 4, x:x + 4] = False
        self.assertAlmostEqual(M.perimeter_ratio(holed), M.perimeter_ratio(mask), delta=0.5)
        self.assertAlmostEqual(M.outline_dimension(holed), M.outline_dimension(mask), delta=0.02)

    def test_ink_lines_are_part_of_the_cloud_not_its_outline(self):
        plain = disc(canvas(300, 300), 150, 150, 100, (240, 245, 255))
        inked = plain.copy()
        for x in range(80, 230, 30):
            inked[60:240, x:x + 2] = (20, 30, 80)        # dark contour lines inside
        a = X.Context(plain, k=2, rule='border')
        b = X.Context(inked, k=2, rule='border')
        self.assertAlmostEqual(X.REGISTRY['outline_length'].measure(a), X.REGISTRY['outline_length'].measure(b), delta=1.0)

    def test_any_sky_colour_works_in_border_mode(self):
        img = canvas()
        for y in range(img.shape[0]):           # a dusk gradient: blue to peach
            t = y / img.shape[0]
            img[y, :] = (60 + 180 * t, 100 + 110 * t, 220 - 40 * t)
        disc(img, 100, 100, 50, (255, 244, 226))  # a warm cream cloud
        cloud, sky = M.segment(img, M.SkyRule(mode='border'))
        self.assertTrue(cloud[100, 100])
        self.assertTrue(sky[5, 5] and sky[190, 5])
        self.assertGreater(cloud.sum(), 7000)

    def test_warm_things_are_not_cloud(self):
        img = disc(canvas(), 100, 100, 50, (240, 245, 255))
        img[:, 95:105] = (120, 80, 60)    # a wooden pole
        cloud, _ = M.segment(img)
        self.assertFalse(cloud[100, 100])


class Tones(unittest.TestCase):
    def test_kmeans_recovers_known_tones_and_shares(self):
        px = np.array([(255, 255, 255)] * 600 + [(110, 160, 240)] * 300 + [(170, 200, 245)] * 100, np.float32)
        pal, labels = M.kmeans(px, 3)
        shares = np.bincount(labels) / len(labels)
        self.assertLess(M.delta_e(pal[0], np.array([110, 160, 240])), 1)
        self.assertLess(M.delta_e(pal[2], np.array([255, 255, 255])), 1)
        np.testing.assert_allclose(shares, [0.3, 0.1, 0.6], atol=1e-6)

    def test_palette_is_dark_to_light(self):
        px = np.random.default_rng(1).uniform(80, 255, (500, 3)).astype(np.float32)
        pal, _ = M.kmeans(px, 4)
        lum = M.luminance(pal)
        self.assertTrue(np.all(np.diff(lum) > 0))


class Shape(unittest.TestCase):
    def test_a_circle_is_smooth(self):
        mask = disc(canvas(400, 400), 200, 200, 150, (255, 255, 255))[..., 0] > 200
        self.assertAlmostEqual(M.outline_dimension(mask), 1.0, delta=0.12)

    def test_an_outline_rough_at_many_scales_scores_higher(self):
        # Like a cumulus: bumps on bumps on bumps.
        yy, xx = np.mgrid[:600, :600]
        ang = np.arctan2(yy - 300, xx - 300)
        dist = np.hypot(xx - 300, yy - 300)
        radius = 220 * (1 + 0.1 * np.sin(7 * ang) + 0.06 * np.sin(23 * ang + 1) + 0.035 * np.sin(61 * ang + 2) + 0.02 * np.sin(157 * ang + 3))
        rough = dist <= radius
        smooth = dist <= 220
        self.assertGreater(M.outline_dimension(rough), M.outline_dimension(smooth) + 0.05)

    def test_shape_measures_do_not_depend_on_resolution(self):
        def shape(scale):
            img = canvas(int(200 * scale), int(200 * scale))
            disc(img, 100 * scale, 100 * scale, 60 * scale, (250, 250, 255))
            disc(img, 70 * scale, 80 * scale, 30 * scale, (140, 180, 240))
            return img
        a, b = X.Context(shape(1), k=2), X.Context(shape(2.5), k=2)
        self.assertAlmostEqual(X.REGISTRY['outline_length'].measure(a), X.REGISTRY['outline_length'].measure(b), delta=2.0)
        self.assertAlmostEqual(X.REGISTRY['tone_boundary'].measure(a), X.REGISTRY['tone_boundary'].measure(b), delta=0.4)


class Regions(unittest.TestCase):
    def test_regions_are_counted_by_connection_not_colour(self):
        tones = np.zeros((40, 40), np.int64)
        tones[:, 20:] = 1
        tones[5:10, 5:10] = 1          # a separate island of tone 1
        cloud = np.ones_like(tones, bool)
        areas = M.tone_regions(tones, cloud)
        self.assertEqual(sorted(areas.tolist()), sorted([800, 775, 25]))

    def test_many_stripes_score_lower_than_a_few_masses(self):
        cloud = np.ones((120, 120), bool)
        masses = np.zeros((120, 120), np.int64)
        masses[60:, :] = 1
        stripes = (np.arange(120)[:, None] // 6 % 2).repeat(120, 1)
        a = M.tone_regions(masses, cloud)
        b = M.tone_regions(stripes, cloud)
        self.assertGreater(a[:8].sum() / a.sum(), b[:8].sum() / b.sum())


class Scoring(unittest.TestCase):
    def setUp(self):
        img = disc(canvas(), 100, 100, 60, (250, 250, 255))
        disc(img, 100, 125, 35, (110, 160, 240))
        self.img = img
        self.target = S.build_target('t', X.Context(img, k=2))

    def test_an_image_matches_its_own_target(self):
        rows, _ = S.check(self.target, self.img)
        self.assertTrue(S.summary(rows)['all_within'])

    def test_a_different_balance_of_tones_is_reported(self):
        other = disc(canvas(), 100, 100, 60, (250, 250, 255))
        disc(other, 100, 100, 55, (110, 160, 240))
        rows, _ = S.check(self.target, other)
        shares = [r for r in rows if 'share' in r['metric']]
        self.assertFalse(all(r['ok'] for r in shares))

    def test_a_target_can_drop_metrics(self):
        t = dict(self.target, metrics={'outline': self.target['metrics']['outline']})
        rows, _ = S.check(t, self.img)
        self.assertEqual([r['metric'] for r in rows], ['outline bumpiness'])

    def test_unknown_metrics_in_a_target_are_skipped_not_fatal(self):
        t = dict(self.target, metrics={**self.target['metrics'], 'retired_idea': {'value': 1, 'tolerance': 1}})
        rows, _ = S.check(t, self.img)
        self.assertTrue(any(r.get('skipped') for r in rows))

    def test_new_metrics_plug_in(self):
        @X.metric('test_coverage', 'coverage', 0.1)
        def coverage(ctx):
            return float(ctx.cloud.mean())

        @coverage.compare
        def _(ref, got, tol):
            return [X.row('coverage', ref, got, got - ref, tol)]
        try:
            t = S.build_target('t', X.Context(self.img, k=2), names=['test_coverage'])
            rows, _ = S.check(t, self.img)
            self.assertEqual(rows[0]['metric'], 'coverage')
            self.assertTrue(rows[0]['ok'])
        finally:
            X.REGISTRY.pop('test_coverage', None)


class Sheets(unittest.TestCase):
    def setUp(self):
        import tempfile, os
        from PIL import Image
        self.dir = tempfile.mkdtemp()
        self.paths = []
        for i, col in enumerate([(255, 0, 0), (0, 255, 0), (0, 0, 255)]):
            p = os.path.join(self.dir, f'{i}.png')
            Image.new('RGB', (200, 100), col).save(p)
            self.paths.append(p)

    def test_grid_lays_cells_out_in_columns(self):
        from studio.analysis import sheet as SH
        im = SH.grid_sheet([(p, f'cell {i}') for i, p in enumerate(self.paths)], cols=2, tile_w=100)
        # two columns of 100px tiles, two rows
        self.assertEqual(im.width, 2 * 100 + 3 * 8)
        self.assertEqual(im.getpixel((8 + 108 + 10, 8 + 10)), (0, 255, 0))       # second cell, first row
        self.assertEqual(im.getpixel((8 + 10, 8 + 50 + 30 + 8 + 10)), (0, 0, 255))  # third cell, second row

    def test_animation_keeps_every_frame(self):
        import os
        from PIL import Image
        from studio.analysis import sheet as SH
        for ext in ('gif', 'webp'):
            out = os.path.join(self.dir, f'a.{ext}')
            SH.animation(self.paths, out, fps=10)
            with Image.open(out) as im:
                self.assertEqual(im.n_frames, 3)


if __name__ == '__main__':
    unittest.main()

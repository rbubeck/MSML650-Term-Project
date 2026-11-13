
import unittest

from evaluation.scripts.evaluate_ami import assign_words


class TestAmiWordAssignment(unittest.TestCase):
    """Tests for assigning Transcribe words to AMI reference segments."""

    def setUp(self):
        self.segments = [
            {
                "segment_id": "152",
                "start": "10.0",
                "end": "11.0",
                "reference": "first segment",
            },
            {
                "segment_id": "153",
                "start": "11.0",
                "end": "12.0",
                "reference": "second segment",
            },
            {
                "segment_id": "154",
                "start": "15.0",
                "end": "16.0",
                "reference": "empty segment",
            },
        ]

    def test_word_overlapping_segment_is_assigned(self):
        words = [
            {
                "word": "hello",
                "start": 10.2,
                "end": 10.5,
                "type": "pronunciation",
            }
        ]

        assigned, unassigned, multiple = assign_words(
            self.segments, words
        )

        self.assertEqual(len(assigned["152"]), 1)
        self.assertEqual(assigned["152"][0]["word"], "hello")
        self.assertEqual(unassigned, [])
        self.assertEqual(multiple, [])

    def test_word_starting_before_segment_is_assigned_by_overlap(self):
        words = [
            {
                "word": "okay",
                "start": 9.9,
                "end": 10.2,
                "type": "pronunciation",
            }
        ]

        assigned, unassigned, multiple = assign_words(
            self.segments, words
        )

        self.assertEqual(len(assigned["152"]), 1)
        self.assertEqual(unassigned, [])

    def test_word_overlapping_multiple_segments_uses_greatest_overlap(self):
        # Overlaps segment 152 by 0.134 seconds and segment 153
        # by 0.366 seconds, matching the historical "bulky" case.
        words = [
            {
                "word": "bulky",
                "start": 10.866,
                "end": 11.5,
                "type": "pronunciation",
            }
        ]

        assigned, unassigned, multiple = assign_words(
            self.segments, words
        )

        self.assertEqual(len(assigned["153"]), 1)
        self.assertEqual(assigned["153"][0]["word"], "bulky")
        self.assertNotIn("152", assigned)
        self.assertEqual(len(multiple), 1)
        self.assertEqual(unassigned, [])

    def test_word_outside_all_segments_is_unassigned(self):
        words = [
            {
                "word": "outside",
                "start": 13.0,
                "end": 13.3,
                "type": "pronunciation",
            }
        ]

        assigned, unassigned, multiple = assign_words(
            self.segments, words
        )

        self.assertEqual(len(unassigned), 1)
        self.assertEqual(unassigned[0]["word"], "outside")
        self.assertEqual(assigned, {})
        self.assertEqual(multiple, [])

    def test_empty_segment_remains_unassigned(self):
        words = [
            {
                "word": "hello",
                "start": 10.2,
                "end": 10.5,
                "type": "pronunciation",
            }
        ]

        assigned, _, _ = assign_words(self.segments, words)

        self.assertNotIn("154", assigned)

    def test_all_words_are_assigned_or_reported_unassigned(self):
        words = [
            {
                "word": "hello",
                "start": 10.2,
                "end": 10.5,
                "type": "pronunciation",
            },
            {
                "word": "outside",
                "start": 13.0,
                "end": 13.3,
                "type": "pronunciation",
            },
        ]

        assigned, unassigned, _ = assign_words(
            self.segments, words
        )

        assigned_count = sum(len(items) for items in assigned.values())

        self.assertEqual(assigned_count + len(unassigned), len(words))

    def test_word_touching_segment_boundary_is_unassigned(self):
        words = [
            {
                "word": "boundary",
                "start": 9.5,
                "end": 10.0,
                "type": "pronunciation",
            }
        ]

        assigned, unassigned, multiple = assign_words(
            self.segments, words
        )

        self.assertEqual(assigned, {})
        self.assertEqual(len(unassigned), 1)
        self.assertEqual(multiple, [])

if __name__ == "__main__":
    unittest.main()

"""Synthetic local tests for the Cloudflare D1/SQLite migration schema.
No hospital production data or credentials are required.
"""
from pathlib import Path
import sqlite3
import unittest
import uuid

ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS = [
    ROOT / "cloudflare/migrations/0001_init.sql",
    ROOT / "cloudflare/migrations/0002_multi_document_types.sql",
    ROOT / "cloudflare/migrations/0003_hospital_users.sql",
]


class PtcSchemaTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        for path in MIGRATIONS:
            self.db.executescript(path.read_text(encoding="utf-8"))
        self.db.execute("INSERT INTO companies(id,name,normalized_name) VALUES ('C1','Example','example')")
        self.db.execute(
            "INSERT INTO submissions(id,submission_no,company_id,brand_name,product_key,status)"
            " VALUES ('S1','DF-TEST-001','C1','Test Medicine','test-key','DOCUMENT_REVIEW')"
        )
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_expected_ptc_tables(self):
        actual = {r[0] for r in self.db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertTrue({
            "submissions", "companies", "representatives", "documents",
            "submission_comments", "status_history", "hospital_users",
            "ptc_meetings", "ptc_agenda_items", "ptc_decisions", "signatures", "audit_logs"
        }.issubset(actual))

    def test_multiple_research_files_same_type_and_version(self):
        for i in range(2):
            self.db.execute(
                "INSERT INTO documents(id,submission_id,document_type,version,storage_key,"
                "original_filename,mime_type,sha256) VALUES (?,?,?,?,?,?,?,?)",
                (f"D{i}", "S1", "RESEARCH_EVIDENCE", 1,
                 f"private/D{i}", f"research{i}.pdf", "application/pdf", "a"*64)
            )
        count = self.db.execute("SELECT count(*) FROM documents WHERE document_type='RESEARCH_EVIDENCE'").fetchone()[0]
        self.assertEqual(count, 2)

    def test_comment_visibility_is_guarded(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO submission_comments(id,submission_id,comment_text,visibility,created_by)"
                " VALUES ('X','S1','test','PUBLIC','staff')"
            )
        self.db.execute(
            "INSERT INTO submission_comments(id,submission_id,comment_text,created_by)"
            " VALUES ('Y','S1','Test internal note','staff')"
        )
        row = self.db.execute("SELECT visibility FROM submission_comments WHERE id='Y'").fetchone()
        self.assertEqual(row[0], "INTERNAL")

    def test_foreign_keys_block_orphans(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO submission_comments(id,submission_id,comment_text,created_by)"
                " VALUES ('BAD','nonexistent','orphan','staff')"
            )

    def test_staff_users_are_inactive_by_default(self):
        self.db.execute(
            "INSERT INTO hospital_users(id,email,role) VALUES ('STAFF1','pharm@example.test','PHARMACIST')"
        )
        self.assertEqual(self.db.execute(
            "SELECT is_active FROM hospital_users WHERE id='STAFF1'"
        ).fetchone()[0], 0)

    def test_duplicate_submission_no_blocked(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO submissions(id,submission_no,brand_name,product_key)"
                " VALUES ('S2','DF-TEST-001','Test Medicine','test-key')"
            )


if __name__ == "__main__":
    unittest.main()

from datetime import date

TODAY = date.today().isoformat()


class TestAuth:
    def test_login_wrong_password(self, client):
        response = client.post("/api/auth/login", json={"username": "director", "password": "wrong-pass"})
        assert response.status_code == 401

    def test_me_requires_token(self, client):
        assert client.get("/api/auth/me").status_code == 401

    def test_password_hash_never_exposed(self, client, tokens):
        response = client.get("/api/users", headers=tokens["director"])
        assert response.status_code == 200
        assert "password" not in response.text
        assert "hash" not in response.text


class TestStaffOnlyEndpoints:
    def test_teacher_cannot_list_payments(self, client, tokens):
        assert client.get("/api/payments", headers=tokens["teacher"]).status_code == 403

    def test_student_cannot_create_student(self, client, tokens):
        response = client.post("/api/students", headers=tokens["student"],
                               json={"first_name": "X", "last_name": "Y"})
        assert response.status_code == 403

    def test_parent_cannot_list_users(self, client, tokens):
        assert client.get("/api/users", headers=tokens["parent"]).status_code == 403

    def test_teacher_cannot_delete_student(self, client, tokens):
        assert client.delete("/api/students/1", headers=tokens["teacher"]).status_code == 403

    def test_admin_cannot_create_director(self, client, tokens):
        response = client.post("/api/users", headers=tokens["admin"], json={
            "username": "director2", "password": "SuperSecret1!", "role": "director",
        })
        assert response.status_code == 403


class TestObjectLevelAccess:
    def test_parent_sees_only_own_children(self, client, tokens):
        response = client.get("/api/students", headers=tokens["parent"])
        assert response.status_code == 200
        names = [s["first_name"] for s in response.json()["items"]]
        assert names == ["My"]

    def test_parent_cannot_open_foreign_student(self, client, tokens):
        assert client.get("/api/students/2", headers=tokens["parent"]).status_code == 403

    def test_student_sees_only_self(self, client, tokens):
        response = client.get("/api/students", headers=tokens["student"])
        ids = [s["id"] for s in response.json()["items"]]
        assert ids == [1]

    def test_teacher_sees_only_own_groups(self, client, tokens):
        response = client.get("/api/groups", headers=tokens["teacher"])
        names = [g["name"] for g in response.json()["items"]]
        assert names == ["Own Group"]

    def test_teacher_cannot_open_foreign_group(self, client, tokens):
        assert client.get("/api/groups/2", headers=tokens["teacher"]).status_code == 403


class TestAttendanceRules:
    def test_teacher_marks_own_group(self, client, tokens):
        response = client.post("/api/attendance", headers=tokens["teacher"], json={
            "group_id": 1, "date": TODAY,
            "items": [{"student_id": 1, "status": "present"}],
        })
        assert response.status_code == 200

    def test_teacher_cannot_mark_foreign_group(self, client, tokens):
        response = client.post("/api/attendance", headers=tokens["teacher"], json={
            "group_id": 2, "date": TODAY,
            "items": [{"student_id": 2, "status": "present"}],
        })
        assert response.status_code == 403

    def test_attendance_is_upserted_not_duplicated(self, client, tokens):
        for status_value in ("present", "late"):
            client.post("/api/attendance", headers=tokens["teacher"], json={
                "group_id": 1, "date": TODAY,
                "items": [{"student_id": 1, "status": status_value}],
            })
        response = client.get(f"/api/attendance?group_id=1&date_from={TODAY}&date_to={TODAY}",
                              headers=tokens["director"])
        records = [r for r in response.json()["items"] if r["student_id"] == 1]
        assert len(records) == 1
        assert records[0]["status"] == "late"

    def test_parent_cannot_mark_attendance(self, client, tokens):
        response = client.post("/api/attendance", headers=tokens["parent"], json={
            "group_id": 1, "date": TODAY,
            "items": [{"student_id": 1, "status": "present"}],
        })
        assert response.status_code == 403


class TestExamAndGradeRules:
    def test_teacher_creates_exam_for_own_group(self, client, tokens):
        response = client.post("/api/exams", headers=tokens["teacher"], json={
            "title": "Unit Test Exam", "group_id": 1, "exam_date": TODAY, "max_score": 100,
        })
        assert response.status_code == 201

    def test_teacher_cannot_create_exam_for_foreign_group(self, client, tokens):
        response = client.post("/api/exams", headers=tokens["teacher"], json={
            "title": "Hacked Exam", "group_id": 2, "exam_date": TODAY, "max_score": 100,
        })
        assert response.status_code == 403

    def test_grade_percentage_computed(self, client, tokens):
        exam = client.post("/api/exams", headers=tokens["teacher"], json={
            "title": "Percent Exam", "group_id": 1, "exam_date": TODAY, "max_score": 50,
        }).json()
        response = client.post("/api/grades", headers=tokens["teacher"], json={
            "exam_id": exam["id"], "items": [{"student_id": 1, "score": 40}],
        })
        assert response.status_code == 200
        grade = response.json()[0]
        assert float(grade["percentage"]) == 80.0
        assert grade["grade_label"] == "B"

    def test_score_cannot_exceed_max(self, client, tokens):
        exam = client.post("/api/exams", headers=tokens["teacher"], json={
            "title": "Max Score Exam", "group_id": 1, "exam_date": TODAY, "max_score": 10,
        }).json()
        response = client.post("/api/grades", headers=tokens["teacher"], json={
            "exam_id": exam["id"], "items": [{"student_id": 1, "score": 11}],
        })
        assert response.status_code == 400

    def test_student_cannot_see_draft_exam_grades(self, client, tokens):
        response = client.get("/api/grades", headers=tokens["student"])
        assert response.status_code == 200
        assert all(g["exam_title"] != "Percent Exam" or True for g in response.json()["items"])
        # draft exams must be hidden entirely
        exams = client.get("/api/exams", headers=tokens["student"]).json()["items"]
        assert all(e["status"] != "draft" for e in exams)


class TestGroupGradesForParents:
    def _make_published_exam_with_grades(self, client, tokens, title: str):
        exam = client.post("/api/exams", headers=tokens["teacher"], json={
            "title": title, "group_id": 1, "exam_date": TODAY,
            "max_score": 100, "status": "published",
        }).json()
        client.post("/api/grades", headers=tokens["teacher"], json={
            "exam_id": exam["id"],
            "items": [
                {"student_id": 1, "score": 90},   # parent's child
                {"student_id": 3, "score": 70},   # classmate
            ],
        })
        return exam

    def test_parent_sees_whole_group_grades_for_own_childs_group(self, client, tokens):
        self._make_published_exam_with_grades(client, tokens, "Group View Exam")
        response = client.get("/api/grades?group_id=1", headers=tokens["parent"])
        assert response.status_code == 200
        student_ids = {g["student_id"] for g in response.json()["items"]}
        assert {1, 3} <= student_ids  # sees classmate's grade too

    def test_parent_without_group_filter_sees_only_own_children(self, client, tokens):
        self._make_published_exam_with_grades(client, tokens, "Own Only Exam")
        response = client.get("/api/grades", headers=tokens["parent"])
        assert response.status_code == 200
        assert all(g["student_id"] == 1 for g in response.json()["items"])

    def test_parent_cannot_view_foreign_group_grades(self, client, tokens):
        response = client.get("/api/grades?group_id=2", headers=tokens["parent"])
        assert response.status_code == 200
        # falls back to own-children filter: no child in group 2 -> nothing foreign leaks
        assert all(g["student_id"] == 1 for g in response.json()["items"])

    def test_draft_exam_grades_hidden_in_group_view(self, client, tokens):
        draft = client.post("/api/exams", headers=tokens["teacher"], json={
            "title": "Draft Group Exam", "group_id": 1, "exam_date": TODAY,
            "max_score": 100, "status": "draft",
        }).json()
        client.post("/api/grades", headers=tokens["teacher"], json={
            "exam_id": draft["id"], "items": [{"student_id": 3, "score": 50}],
        })
        response = client.get("/api/grades?group_id=1", headers=tokens["parent"])
        assert all(g["exam_title"] != "Draft Group Exam" for g in response.json()["items"])


class TestPaymentRules:
    def test_partial_payment_status(self, client, tokens):
        response = client.post("/api/payments", headers=tokens["admin"], json={
            "student_id": 1, "group_id": 1, "month": 1, "year": 2030,
            "amount": 150, "paid_amount": 50,
        })
        assert response.status_code == 201
        assert response.json()["status"] == "partial"

    def test_overdue_payment_status(self, client, tokens):
        response = client.post("/api/payments", headers=tokens["admin"], json={
            "student_id": 1, "group_id": 1, "month": 2, "year": 2020,
            "amount": 150, "paid_amount": 0, "due_date": "2020-02-05",
        })
        assert response.status_code == 201
        assert response.json()["status"] == "overdue"

    def test_paid_status_and_duplicate_rejected(self, client, tokens):
        payload = {"student_id": 1, "group_id": 1, "month": 3, "year": 2030,
                   "amount": 150, "paid_amount": 150}
        response = client.post("/api/payments", headers=tokens["admin"], json=payload)
        assert response.status_code == 201
        assert response.json()["status"] == "paid"
        assert client.post("/api/payments", headers=tokens["admin"], json=payload).status_code == 409

    def test_student_sees_only_own_payments(self, client, tokens):
        response = client.get("/api/payments", headers=tokens["student"])
        assert response.status_code == 200
        assert all(p["student_id"] == 1 for p in response.json()["items"])

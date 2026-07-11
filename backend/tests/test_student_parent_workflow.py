TODAY = "2026-01-15"


class TestCreateStudentBasic:
    def test_create_student_without_parent(self, client, tokens):
        response = client.post("/api/students", headers=tokens["director"], json={
            "first_name": "Solo", "last_name": "Kid",
        })
        assert response.status_code == 201
        body = response.json()
        assert body["student"]["first_name"] == "Solo"
        assert body["created_parents"] == []
        assert body["linked_parents"] == []
        assert body["accounts"] == []


class TestExistingParentLink:
    def test_create_student_with_existing_parent(self, client, tokens):
        parent = client.post("/api/parents", headers=tokens["director"], json={
            "first_name": "Existing", "last_name": "Mom",
        }).json()
        response = client.post("/api/students", headers=tokens["director"], json={
            "first_name": "Linked", "last_name": "Kid",
            "existing_parent_links": [{"parent_id": parent["id"], "relation": "mother"}],
        })
        assert response.status_code == 201
        body = response.json()
        assert len(body["linked_parents"]) == 1
        assert body["linked_parents"][0]["id"] == parent["id"]
        assert body["student"]["parents"][0]["relation"] == "mother"

    def test_existing_parent_can_be_linked_to_multiple_children(self, client, tokens):
        parent = client.post("/api/parents", headers=tokens["director"], json={
            "first_name": "Multi", "last_name": "Parent",
        }).json()
        for name in ("First", "Second"):
            r = client.post("/api/students", headers=tokens["director"], json={
                "first_name": name, "last_name": "Child",
                "existing_parent_links": [{"parent_id": parent["id"], "relation": "father"}],
            })
            assert r.status_code == 201
        full_parent = client.get(f"/api/parents/{parent['id']}", headers=tokens["director"]).json()
        names = {c["first_name"] for c in full_parent["children"]}
        assert {"First", "Second"} <= names


class TestNewParentInline:
    def test_create_student_with_new_parent(self, client, tokens):
        response = client.post("/api/students", headers=tokens["director"], json={
            "first_name": "New", "last_name": "Kid",
            "new_parents": [{
                "first_name": "Brand", "last_name": "NewParent",
                "phone": "+992900000001", "relation": "father",
            }],
        })
        assert response.status_code == 201
        body = response.json()
        assert len(body["created_parents"]) == 1
        assert body["created_parents"][0]["first_name"] == "Brand"
        assert body["student"]["parents"][0]["relation"] == "father"

    def test_create_student_with_two_parents(self, client, tokens):
        response = client.post("/api/students", headers=tokens["director"], json={
            "first_name": "Two", "last_name": "ParentsKid",
            "new_parents": [
                {"first_name": "Dad", "last_name": "X", "phone": "+992900000002", "relation": "father"},
                {"first_name": "Mom", "last_name": "X", "phone": "+992900000003", "relation": "mother"},
            ],
        })
        assert response.status_code == 201
        body = response.json()
        assert len(body["created_parents"]) == 2
        assert len(body["student"]["parents"]) == 2
        relations = {p["relation"] for p in body["student"]["parents"]}
        assert relations == {"father", "mother"}


class TestDuplicateProtection:
    def test_duplicate_parent_phone_returns_conflict(self, client, tokens):
        client.post("/api/parents", headers=tokens["director"], json={
            "first_name": "Dup", "last_name": "Original", "phone": "+992911111111",
        })
        response = client.post("/api/students", headers=tokens["director"], json={
            "first_name": "Dup", "last_name": "Kid",
            "new_parents": [{"first_name": "Dup", "last_name": "Copy", "phone": "+992911111111"}],
        })
        assert response.status_code == 409
        detail = response.json()["detail"]
        assert detail["message"] == "duplicate_parents"
        assert detail["duplicates"][0]["field"] == "phone"

    def test_allow_duplicate_overrides_conflict(self, client, tokens):
        client.post("/api/parents", headers=tokens["director"], json={
            "first_name": "Dup2", "last_name": "Original", "phone": "+992922222222",
        })
        response = client.post("/api/students", headers=tokens["director"], json={
            "first_name": "Dup2", "last_name": "Kid",
            "new_parents": [{"first_name": "Dup2", "last_name": "Copy",
                             "phone": "+992922222222", "allow_duplicate": True}],
        })
        assert response.status_code == 201

    def test_student_creation_rolled_back_when_duplicate_found(self, client, tokens):
        """The whole request is rejected before any writes happen, so no orphaned
        student/parent rows are left behind when a duplicate is detected."""
        before = client.get("/api/students?search=RollbackKid", headers=tokens["director"]).json()["total"]
        client.post("/api/parents", headers=tokens["director"], json={
            "first_name": "Roll", "last_name": "Back", "phone": "+992933333333",
        })
        response = client.post("/api/students", headers=tokens["director"], json={
            "first_name": "RollbackKid", "last_name": "X",
            "new_parents": [{"first_name": "Roll", "last_name": "Back2", "phone": "+992933333333"}],
        })
        assert response.status_code == 409
        after = client.get("/api/students?search=RollbackKid", headers=tokens["director"]).json()["total"]
        assert after == before


class TestAccountCreation:
    def test_create_student_account_automatically(self, client, tokens):
        response = client.post("/api/students", headers=tokens["director"], json={
            "first_name": "Login", "last_name": "Student",
            "create_student_user_account": True,
        })
        assert response.status_code == 201
        body = response.json()
        accounts = body["accounts"]
        assert len(accounts) == 1
        assert accounts[0]["role"] == "student"
        assert accounts[0]["username"]
        assert len(accounts[0]["temporary_password"]) >= 10
        assert body["student"]["user_id"] == accounts[0]["user_id"]

    def test_create_parent_account_automatically(self, client, tokens):
        response = client.post("/api/students", headers=tokens["director"], json={
            "first_name": "HasParent", "last_name": "Account",
            "new_parents": [{"first_name": "Account", "last_name": "Parent",
                             "phone": "+992944444444", "create_user_account": True}],
        })
        assert response.status_code == 201
        body = response.json()
        parent_accounts = [a for a in body["accounts"] if a["role"] == "parent"]
        assert len(parent_accounts) == 1
        assert parent_accounts[0]["username"].startswith("parent")

    def test_generated_password_returned_only_once(self, client, tokens):
        response = client.post("/api/students", headers=tokens["director"], json={
            "first_name": "OnceOnly", "last_name": "Kid",
            "create_student_user_account": True,
        })
        student_id = response.json()["student"]["id"]
        fetched = client.get(f"/api/students/{student_id}", headers=tokens["director"]).json()
        assert "temporary_password" not in fetched
        assert "password" not in str(fetched).lower().replace("temporary_password", "")

    def test_password_hash_never_exposed_in_create_response(self, client, tokens):
        response = client.post("/api/students", headers=tokens["director"], json={
            "first_name": "Hash", "last_name": "Check",
            "create_student_user_account": True,
        })
        assert "password_hash" not in response.text

    def test_reset_password_generates_new_credentials(self, client, tokens):
        created = client.post("/api/students", headers=tokens["director"], json={
            "first_name": "Reset", "last_name": "Me",
            "create_student_user_account": True,
        }).json()
        student_id = created["student"]["id"]
        old_password = created["accounts"][0]["temporary_password"]
        reset = client.post(f"/api/students/{student_id}/reset-password", headers=tokens["director"])
        assert reset.status_code == 200
        assert reset.json()["temporary_password"] != old_password

    def test_create_account_conflict_if_already_exists(self, client, tokens):
        created = client.post("/api/students", headers=tokens["director"], json={
            "first_name": "AlreadyHas", "last_name": "Account",
            "create_student_user_account": True,
        }).json()
        student_id = created["student"]["id"]
        response = client.post(f"/api/students/{student_id}/create-account", headers=tokens["director"])
        assert response.status_code == 409


class TestParentSearch:
    def test_search_finds_by_phone_prefix(self, client, tokens):
        client.post("/api/parents", headers=tokens["director"], json={
            "first_name": "Searchable", "last_name": "Person", "phone": "+992955555555",
        })
        response = client.get("/api/parents/search?q=%2B992955", headers=tokens["director"])
        assert response.status_code == 200
        names = [p["full_name"] for p in response.json()]
        assert "Searchable Person" in names

    def test_search_result_capped(self, client, tokens):
        response = client.get("/api/parents/search?q=&limit=5", headers=tokens["director"])
        assert response.status_code == 200
        assert len(response.json()) <= 5

    def test_search_includes_children_count(self, client, tokens):
        parent = client.post("/api/parents", headers=tokens["director"], json={
            "first_name": "CountMe", "last_name": "Parent",
        }).json()
        client.post("/api/students", headers=tokens["director"], json={
            "first_name": "Kid1", "last_name": "Of",
            "existing_parent_links": [{"parent_id": parent["id"], "relation": "guardian"}],
        })
        response = client.get("/api/parents/search?q=CountMe", headers=tokens["director"])
        match = next(p for p in response.json() if p["id"] == parent["id"])
        assert match["children_count"] == 1


class TestLinkUnlinkAfterCreation:
    def test_link_existing_parent_to_existing_student(self, client, tokens):
        student = client.post("/api/students", headers=tokens["director"], json={
            "first_name": "Existing", "last_name": "Student",
        }).json()["student"]
        parent = client.post("/api/parents", headers=tokens["director"], json={
            "first_name": "Late", "last_name": "Linked",
        }).json()
        response = client.post(f"/api/students/{student['id']}/parents", headers=tokens["director"], json={
            "parent_id": parent["id"], "relation": "guardian",
        })
        assert response.status_code == 200
        assert any(p["id"] == parent["id"] for p in response.json()["parents"])

    def test_unlink_parent_from_student(self, client, tokens):
        parent = client.post("/api/parents", headers=tokens["director"], json={
            "first_name": "ToUnlink", "last_name": "Parent",
        }).json()
        student = client.post("/api/students", headers=tokens["director"], json={
            "first_name": "UnlinkTarget", "last_name": "Kid",
            "existing_parent_links": [{"parent_id": parent["id"], "relation": "father"}],
        }).json()["student"]
        response = client.delete(f"/api/students/{student['id']}/parents/{parent['id']}",
                                 headers=tokens["director"])
        assert response.status_code == 200
        refreshed = client.get(f"/api/students/{student['id']}", headers=tokens["director"]).json()
        assert refreshed["parents"] == []


class TestParentSeesLinkedChild:
    def test_parent_sees_child_after_creation(self, client, tokens):
        signup = client.post("/api/students", headers=tokens["director"], json={
            "first_name": "Visible", "last_name": "ToParent",
            "new_parents": [{
                "first_name": "Sees", "last_name": "Child", "phone": "+992966666666",
                "create_user_account": True,
            }],
        }).json()
        parent_account = signup["accounts"][0]
        login = client.post("/api/auth/login", json={
            "username": parent_account["username"], "password": parent_account["temporary_password"],
        })
        assert login.status_code == 200
        parent_token = {"Authorization": f"Bearer {login.json()['access_token']}"}
        response = client.get("/api/students", headers=parent_token)
        assert response.status_code == 200
        names = [s["first_name"] for s in response.json()["items"]]
        assert "Visible" in names


class TestUserDetailEndpoint:
    def test_get_user_by_id(self, client, tokens):
        created = client.post("/api/students", headers=tokens["director"], json={
            "first_name": "Fetchable", "last_name": "User",
            "create_student_user_account": True,
        }).json()
        user_id = created["accounts"][0]["user_id"]
        response = client.get(f"/api/users/{user_id}", headers=tokens["director"])
        assert response.status_code == 200
        assert response.json()["id"] == user_id

    def test_audit_logs_route_not_shadowed_by_user_id_route(self, client, tokens):
        response = client.get("/api/users/audit-logs", headers=tokens["director"])
        assert response.status_code == 200
        assert "items" in response.json()


class TestPermissions:
    def test_teacher_cannot_search_parents(self, client, tokens):
        assert client.get("/api/parents/search?q=a", headers=tokens["teacher"]).status_code == 403

    def test_teacher_cannot_create_parent_account(self, client, tokens):
        parent = client.post("/api/parents", headers=tokens["director"], json={
            "first_name": "Guarded", "last_name": "Parent",
        }).json()
        response = client.post(f"/api/parents/{parent['id']}/create-account", headers=tokens["teacher"])
        assert response.status_code == 403

    def test_parent_cannot_link_children(self, client, tokens):
        student = client.post("/api/students", headers=tokens["director"], json={
            "first_name": "NoTouch", "last_name": "Kid",
        }).json()["student"]
        parent = client.post("/api/parents", headers=tokens["director"], json={
            "first_name": "NoTouch", "last_name": "Parent",
        }).json()
        response = client.post(f"/api/students/{student['id']}/parents", headers=tokens["parent"], json={
            "parent_id": parent["id"], "relation": "guardian",
        })
        assert response.status_code == 403

    def test_parent_cannot_create_accounts(self, client, tokens):
        student = client.post("/api/students", headers=tokens["director"], json={
            "first_name": "NoAcc", "last_name": "Kid",
        }).json()["student"]
        response = client.post(f"/api/students/{student['id']}/create-account", headers=tokens["parent"])
        assert response.status_code == 403

    def test_admin_can_create_accounts(self, client, tokens):
        response = client.post("/api/students", headers=tokens["admin"], json={
            "first_name": "AdminMade", "last_name": "Kid",
            "create_student_user_account": True,
        })
        assert response.status_code == 201

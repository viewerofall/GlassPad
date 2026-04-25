// src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Note {
    id: String,
    title: String,
    content: String,
    folder: String,
    parent_id: Option<String>,
    tags: Vec<String>,
    created_at: i64,
    updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]  // Added Clone here
struct Folder {
    id: String,
    name: String,
    parent_id: Option<String>,
}

fn get_app_dir() -> PathBuf {
    let mut path = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push(".scratchpad");
    path.push("notes");
    fs::create_dir_all(&path).ok();
    path
}

fn get_folders_file() -> PathBuf {
    let mut path = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push(".scratchpad");
    fs::create_dir_all(&path).ok();
    path.push("folders.json");
    path
}

#[tauri::command]
fn save_note(note: Note) -> Result<(), String> {
    let app_dir = get_app_dir();
    let filename = format!("{}.md", note.id);
    let file_path = app_dir.join(&filename);

    // Create markdown content with metadata
    let tags_str = note.tags.join(", ");
    let metadata = format!(
        "---\nid: {}\ntitle: {}\nfolder: {}\nparent_id: {}\ntags: {}\ncreated_at: {}\nupdated_at: {}\n---\n\n",
        note.id,
        note.title,
        note.folder,
        note.parent_id.as_deref().unwrap_or("null"),
        tags_str,
        note.created_at,
        note.updated_at
    );

    let full_content = format!("{}{}", metadata, note.content);

    fs::write(file_path, full_content).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_notes() -> Result<Vec<Note>, String> {
    let app_dir = get_app_dir();
    let mut notes = Vec::new();

    if let Ok(entries) = fs::read_dir(app_dir) {
        for entry in entries.flatten() {
            if let Some(ext) = entry.path().extension() {
                if ext == "md" {
                    if let Ok(content) = fs::read_to_string(entry.path()) {
                        if let Some(note) = parse_markdown_note(&content) {
                            notes.push(note);
                        }
                    }
                }
            }
        }
    }

    Ok(notes)
}

fn parse_markdown_note(content: &str) -> Option<Note> {
    let parts: Vec<&str> = content.splitn(2, "---\n\n").collect();
    if parts.len() != 2 {
        return None;
    }

    let metadata = parts[0].trim_start_matches("---\n");
    let note_content = parts[1];

    let mut id = String::new();
    let mut title = String::new();
    let mut folder = String::from("default");
    let mut parent_id: Option<String> = None;
    let mut tags: Vec<String> = Vec::new();
    let mut created_at = 0i64;
    let mut updated_at = 0i64;

    for line in metadata.lines() {
        let kv: Vec<&str> = line.splitn(2, ": ").collect();
        if kv.len() == 2 {
            match kv[0] {
                "id" => id = kv[1].to_string(),
                "title" => title = kv[1].to_string(),
                "folder" => folder = kv[1].to_string(),
                "parent_id" => {
                    if kv[1] != "null" {
                        parent_id = Some(kv[1].to_string());
                    }
                }
                "tags" => {
                    if !kv[1].trim().is_empty() {
                        tags = kv[1].split(',').map(|t| t.trim().to_string()).filter(|t| !t.is_empty()).collect();
                    }
                }
                "created_at" => created_at = kv[1].parse().unwrap_or(0),
                "updated_at" => updated_at = kv[1].parse().unwrap_or(0),
                _ => {}
            }
        }
    }

    Some(Note {
        id,
         title,
         content: note_content.to_string(),
         folder,
         parent_id,
         tags,
         created_at,
         updated_at,
    })
}

#[tauri::command]
fn delete_note(note_id: String) -> Result<(), String> {
    let app_dir = get_app_dir();
    let file_path = app_dir.join(format!("{}.md", note_id));
    fs::remove_file(file_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn search_notes(query: String) -> Result<Vec<Note>, String> {
    let notes = load_notes()?;
    let query_lower = query.to_lowercase();

    let results: Vec<Note> = notes
    .into_iter()
    .filter(|note| {
        note.title.to_lowercase().contains(&query_lower)
        || note.content.to_lowercase().contains(&query_lower)
        || note.tags.iter().any(|t| t.to_lowercase().contains(&query_lower))
    })
    .collect();

    Ok(results)
}

#[tauri::command]
fn save_folders(folders: Vec<Folder>) -> Result<(), String> {
    let folders_file = get_folders_file();
    let json = serde_json::to_string_pretty(&folders).map_err(|e| e.to_string())?;
    fs::write(folders_file, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_folders() -> Result<Vec<Folder>, String> {
    let folders_file = get_folders_file();

    if !folders_file.exists() {
        // Create default folder
        let default_folders = vec![Folder {
            id: "default".to_string(),
            name: "Notes".to_string(),
            parent_id: None,
        }];
        save_folders(default_folders.clone())?;
        return Ok(default_folders);
    }

    let content = fs::read_to_string(folders_file).map_err(|e| e.to_string())?;
    let folders: Vec<Folder> = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(folders)
}

#[tauri::command]
fn get_backlinks(note_id: String) -> Result<Vec<Note>, String> {
    let notes = load_notes()?;
    let target_title = notes.iter().find(|n| n.id == note_id)
        .map(|n| n.title.clone())
        .unwrap_or_default();
    let pattern = format!("[[{}]]", target_title);
    Ok(notes.into_iter().filter(|n| n.id != note_id && n.content.contains(&pattern)).collect())
}

#[tauri::command]
fn list_directory(path: String) -> Result<Vec<String>, String> {
    let expanded_path = if path.starts_with('~') {
        dirs::home_dir()
            .ok_or("Cannot determine home directory")?
            .join(&path[2..])
    } else {
        PathBuf::from(&path)
    };

    if !expanded_path.exists() {
        return Ok(vec![]);
    }

    let mut items = Vec::new();
    if let Ok(entries) = fs::read_dir(&expanded_path) {
        for entry in entries.flatten() {
            if let Ok(name) = entry.file_name().into_string() {
                items.push(name);
            }
        }
    }

    items.sort();
    Ok(items)
}

#[tauri::command]
fn save_file(path: String, content: String) -> Result<(), String> {
    let expanded_path = if path.starts_with('~') {
        dirs::home_dir()
            .ok_or("Cannot determine home directory")?
            .join(&path[2..])
    } else {
        PathBuf::from(&path)
    };

    fs::write(expanded_path, content).map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .invoke_handler(tauri::generate_handler![
        save_note,
        load_notes,
        delete_note,
        search_notes,
        save_folders,
        load_folders,
        get_backlinks,
        list_directory,
        save_file
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

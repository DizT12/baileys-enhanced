use js_sys::{Array, Reflect, Uint8Array};
use wacore_libsignal::protocol::SessionRecord as CoreSessionRecord;
use wasm_bindgen::prelude::*;

const INVALID_INPUT_ERROR: &str = "SessionRecord.deserialize: Invalid input type. Expected Uint8Array, Array, or Buffer-like object.";
const SESSIONS_KEY: &str = "_sessions";
const DATA_KEY: &str = "data";

#[wasm_bindgen(js_name = SessionRecord)]
pub struct SessionRecord {
    pub(crate) serialized_data: Vec<u8>,
}

#[wasm_bindgen(js_class = SessionRecord)]
impl SessionRecord {
    pub(crate) fn new(data: Vec<u8>) -> Self {
        Self {
            serialized_data: data,
        }
    }

    #[wasm_bindgen(js_name = deserialize)]
    pub fn deserialize(val: JsValue) -> Result<SessionRecord, JsValue> {
        // 1. Uint8Array (Standard Rust Bridge format / Protobuf)
        if let Some(uint8_array) = val.dyn_ref::<Uint8Array>() {
            return Ok(SessionRecord::new(uint8_array.to_vec()));
        }

        // 2. Standard Array (sometimes passed by generic serialization)
        if Array::is_array(&val) {
            return Ok(SessionRecord::new(js_array_to_vec(val.unchecked_ref())?));
        }

        // 3. Legacy libsignal-node JSON format (has "_sessions" key)
        // Returns empty record to trigger safe re-negotiation
        if Reflect::has(&val, &JsValue::from_str(SESSIONS_KEY)).unwrap_or(false) {
            return create_empty_session_record();
        }

        // 4. Buffer-like objects { type: 'Buffer', data: [...] }
        if let Ok(data) = Reflect::get(&val, &JsValue::from_str(DATA_KEY))
            && Array::is_array(&data)
        {
            return Ok(SessionRecord::new(js_array_to_vec(data.unchecked_ref())?));
        }

        Err(JsValue::from_str(INVALID_INPUT_ERROR))
    }

    pub fn serialize(&self) -> Uint8Array {
        Uint8Array::from(self.serialized_data.as_slice())
    }

    #[wasm_bindgen(js_name = haveOpenSession)]
    pub fn have_open_session(&self) -> bool {
        CoreSessionRecord::deserialize(&self.serialized_data)
            .map(|record| record.session_state().is_some())
            .unwrap_or(false)
    }
}

fn create_empty_session_record() -> Result<SessionRecord, JsValue> {
    let empty_record = CoreSessionRecord::deserialize(&[])
        .map_err(|e| JsValue::from_str(&format!("Failed to create empty session record: {e}")))?;
    let bytes = empty_record
        .serialize()
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    Ok(SessionRecord::new(bytes))
}

pub(crate) fn js_array_to_vec(array: &Array) -> Result<Vec<u8>, JsValue> {
    let mut bytes = Vec::new();

    for index in 0..array.length() {
        let value = array.get(index).as_f64().ok_or_else(|| {
            JsValue::from_str(&format!("Invalid byte at index {index}: expected a number"))
        })?;

        if !value.is_finite() || value.fract() != 0.0 || !(0.0..=255.0).contains(&value) {
            return Err(JsValue::from_str(&format!(
                "Invalid byte at index {index}: expected an integer between 0 and 255"
            )));
        }

        bytes.push(value as u8);
    }

    Ok(bytes)
}

import axios from "axios";
import validator from "validator";
import doiRegex from "doi-regex";
import Swal from "sweetalert2";
import determineDatasetLocation, { Destinations } from "../analytics/analytics-utils"
import introJs from "intro.js";
import {clientError, userErrorMessage} from '../others/http-error-handler/error-handler'
import kombuchaEnums from "../analytics/analytics-enums";
import createEventDataPrepareMetadata from "../analytics/prepare-metadata-analytics";
import client from '../client'


while (!window.htmlPagesAdded) {
  await new Promise((resolve) => setTimeout(resolve, 100))
}

// event listeners for open dropdown prompt
document.querySelectorAll(".subjects-change-current-account").forEach((element) => {
  element.addEventListener("click", function () {
    window.openDropdownPrompt(null, "bf");
  });
});

document.querySelectorAll(".subjects-change-current-ds").forEach((element) => {
  element.addEventListener("click", function () {
    window.openDropdownPrompt(null, "dataset");
  });
});

document.querySelectorAll(".samples-change-current-account").forEach((element) => {
  element.addEventListener("click", function () {
    window.openDropdownPrompt(null, "bf");
  });
});

document.querySelectorAll(".samples-change-current-ds").forEach((element) => {
  element.addEventListener("click", function () {
    window.openDropdownPrompt(null, "dataset");
  });
});

var subjectsFormDiv = document.getElementById("form-add-a-subject");
window.guidedSubjectsFormDiv = document.getElementById("guided-form-add-a-subject");
var samplesFormDiv = document.getElementById("form-add-a-sample");
window.guidedSamplesFormDiv = document.getElementById("guided-form-add-a-sample");
window.subjectsTableData = [];
window.subjectsFileData = [];
window.samplesTableData = [];
window.samplesFileData = [];
var headersArrSubjects = [];
var headersArrSamples = [];
let guidedSamplesTableData = [];

window.showForm = (type, editBoolean) => {
  if (type !== "edit") {
    window.clearAllSubjectFormFields(subjectsFormDiv);
  }
  subjectsFormDiv.style.display = "flex";
  $("#create_subjects-tab").removeClass("show");
  $("#create_subjects-tab").css("display", "none");
  $("#footer-div-subjects").css("display", "none");
  $("#btn-add-custom-field").show();
  $("#sidebarCollapse").prop("disabled", "true");
};

window.showFormSamples = (type, editBoolean) => {
  if (type !== "edit") {
    window.clearAllSubjectFormFields(samplesFormDiv);
  }
  samplesFormDiv.style.display = "flex";
  $("#create_samples-tab").removeClass("show");
  $("#create_samples-tab").css("display", "none");
  $("#footer-div-samples").css("display", "none");
  $("#btn-add-custom-field-samples").show();
  $("#sidebarCollapse").prop("disabled", "true");
};

var selectHTMLSamples =
  "<div><select id='previous-subject' class='swal2-input' onchange='displayPreviousSample()'></select><select style='display:none' id='previous-sample' class='swal2-input' onchange='confirmSample()'></select></div>";
var prevSubID = "";
var prevSamID = "";
var prevSubIDSingle = "";
var selectHTMLSubjects =
  "<div><select id='previous-subject-single' class='swal2-input'></select></div>";

const promptImportPrevInfoSamples = (arr1, arr2) => {
  Swal.fire({
    title: "Choose a previous sample:",
    html: selectHTMLSamples,
    showCancelButton: true,
    cancelButtonText: "Cancel",
    confirmButtonText: "Confirm",
    reverseButtons: window.reverseSwalButtons,
    customClass: {
      confirmButton: "confirm-disabled",
    },
    onOpen: function () {
      $(".swal2-confirm").attr("id", "btn-confirm-previous-import");
      window.removeOptions(document.getElementById("previous-subject"));
      window.removeOptions(document.getElementById("previous-sample"));
      $("#previous-subject").append(`<option value="Select">Select a subject</option>`);
      $("#previous-sample").append(`<option value="Select">Select a sample</option>`);
      for (var ele of arr1) {
        $("#previous-subject").append(`<option value="${ele}">${ele}</option>`);
      }
    },
  }).then((result) => {
    if (result.isConfirmed) {
      if ($("#previous-subject").val() !== "Select" && $("#previous-sample").val() !== "Select") {
        window.populateFormsSamples(prevSubID, prevSamID, "import", "free-form");
      }
    } else {
      hideForm("sample");
    }
  });
};

// onboarding for subjects/samples file
const onboardingMetadata = (type) => {
  var helperButtons = $($($(`#table-${type}s`).children()[1]).find(`.row-${type}s`)[0]).find(
    ".contributor-helper-buttons"
  )[0];

  if (!introStatus[type]) {
    introJs()
      .setOptions({
        steps: [
          {
            title: "Buttons",
            element: helperButtons,
            intro: "Click on these buttons to manipulate a " + type + ".",
          },
          {
            title: `1. Edit a ${type}`,
            element: $(helperButtons).children()[0],
            intro: "Click here to edit the information about a corresponding " + type + ".",
          },
          {
            title: `2. Copy a ${type}`,
            element: $(helperButtons).children()[1],
            intro:
              "Click here to copy information from the corresponding " +
              type +
              " onto a new " +
              type +
              ". Note: You have to enter an ID for the new " +
              type +
              " after clicking on this.",
          },
          {
            title: `3. Delete a ${type}`,
            element: $(helperButtons).children()[2],
            intro:
              "Click here to delete a corresponding " +
              type +
              " from the table. This will permanently delete the " +
              type +
              " from SODA and cannot be reverted.",
          },
        ],
        exitOnEsc: false,
        exitOnOverlayClick: false,
        disableInteraction: false,
      })
      .onbeforeexit(function () {
        introStatus[type] = true;
      })
      .start();
  }
};

const promptImportPrevInfoSubject = (arr1) => {
  Swal.fire({
    title: "Choose a previous subject:",
    html: selectHTMLSubjects,
    showCancelButton: true,
    cancelButtonText: "Cancel",
    confirmButtonText: "Confirm",
    reverseButtons: window.reverseSwalButtons,
    onOpen: function () {
      window.removeOptions(document.getElementById("previous-subject-single"));
      $("#previous-subject-single").append(`<option value="Select">Select a subject</option>`);
      for (var ele of arr1) {
        $("#previous-subject-single").append(`<option value="${ele}">${ele}</option>`);
      }
    },
  }).then((result) => {
    if (result.isConfirmed) {
      if ($("#previous-subject-single").val() !== "Select") {
        prevSubIDSingle = $("#previous-subject-single").val();
        window.populateForms(prevSubIDSingle, "import", "free-form");
      }
    } else {
      hideForm("subject");
    }
  });
};

const displayPreviousSample = () => {
  if ($("#previous-subject").val() !== "Select") {
    $("#previous-sample").css("display", "block");
    prevSubID = $("#previous-subject").val();
    // load previous sample ids accordingly for a particular subject
    var prevSampleArr = [];
    for (var subject of window.samplesTableData.slice(1)) {
      if (subject[0] === prevSubID) {
        prevSampleArr.push(subject[1]);
      }
    }
    for (var ele of prevSampleArr) {
      $("#previous-sample").append(`<option value="${ele}">${ele}</option>`);
    }
  } else {
    $("#previous-sample").css("display", "none");
    prevSubID = "";
  }
};

const confirmSample = () => {
  if ($("#previous-sample").val() !== "Select") {
    $("#btn-confirm-previous-import").removeClass("confirm-disabled");
    prevSamID = $("#previous-sample").val();
  } else {
    $("#btn-confirm-previous-import").addClass("confirm-disabled");
    prevSamID = "";
  }
};

// for "Done adding" button - subjects
window.addSubject = (curationMode) => {
  let subjectID = "";
  if (curationMode === "free-form") {
    subjectID = $("#bootbox-subject-id").val().trim();
    if (subjectID === "") {
      notyf.open({
        type: "error",
        message: "The subject_id is required to add a subject.",
        duration: 3000,
      });
      return;
    }

    const subjectNameIsValid = window.evaluateStringAgainstSdsRequirements(
      subjectID,
      "string-adheres-to-identifier-conventions"
    );

    if (!subjectNameIsValid) {
      notyf.open({
        type: "error",
        message: "The subject_id can not contain special characters.",
        duration: 4000,
      });
      return;
    }

    addSubjectIDtoDataBase(subjectID);
    if (window.subjectsTableData.length !== 0) {
      $("#div-import-primary-folder-subjects").hide();
    }
    if (window.subjectsTableData.length === 2) {
      onboardingMetadata("subject");
    }
  }
  if (curationMode === "guided") {
    addSubjectMetadataEntriesIntoJSON("guided");
  }
};

// for "Done adding" button - samples
window.addSample = (curationMode) => {
  let sampleID = "";
  let subjectID = "";
  if (curationMode === "free-form") {
    sampleID = $("#bootbox-sample-id").val().trim();
    subjectID = $("#bootbox-subject-id-samples").val().trim();
    if (sampleID === "" || subjectID === "") {
      notyf.open({
        type: "error",
        message: "The subject_id and sample_id are required to add a sample.",
        duration: 3000,
      });
      return;
    }

    const sampleNameIsValid = window.evaluateStringAgainstSdsRequirements(
      sampleID,
      "string-adheres-to-identifier-conventions"
    );
    if (!sampleNameIsValid) {
      notyf.open({
        type: "error",
        message: "The sample_id can not contain special characters.",
        duration: 4000,
      });
      return;
    }
    const subjectNameIsValid = window.evaluateStringAgainstSdsRequirements(
      subjectID,
      "string-adheres-to-identifier-conventions"
    );
    if (!subjectNameIsValid) {
      notyf.open({
        type: "error",
        message: "The subject_id can not contain special characters.",
        duration: 4000,
      });
      return;
    }

    addSampleIDtoDataBase(sampleID, subjectID);
    if (window.samplesTableData.length !== 0) {
      $("#div-import-primary-folder-samples").hide();
    }
    if (window.samplesTableData.length === 2) {
      onboardingMetadata("sample");
    }
  }

  if (curationMode === "guided") {
    addSampleMetadataEntriesIntoJSON("guided");
  }
};

window.warningBeforeHideForm = (type) => {
  Swal.fire({
    title: "Are you sure you want to cancel?",
    text: "This will reset your progress with the current subject_id.",
    icon: "warning",
    showCancelButton: true,
    showConfirmButton: true,
    confirmButtonText: "Yes, cancel",
    cancelButtonText: "No, stay here",
    reverseButtons: window.reverseSwalButtons,
    heightAuto: false,
    backdrop: "rgba(0,0,0, 0.4)",
  }).then((result) => {
    if (result.isConfirmed) {
      if (type === "subjects") {
        hideForm("subject");
      } else {
        hideForm("sample");
      }
    }
  });
};

const hideForm = (type) => {
  var formDiv;
  if (type === "subject") {
    formDiv = subjectsFormDiv;
  } else if (type === "sample") {
    formDiv = samplesFormDiv;
  }
  formDiv.style.display = "none";
  $("#create_" + type + "s-tab").addClass("show");
  $("#create_" + type + "s-tab").css("display", "flex");
  $("#footer-div-" + type + "s").css("display", "flex");
  $("#sidebarCollapse").prop("disabled", false);
  $("#btn-edit-" + type + "").css("display", "none");
  $("#btn-add-" + type + "").css("display", "inline-block");
};

window.validateSubSamID = (ev) => {
  var id = $(ev).prop("id");
  var value = $("#" + id).val();
  //Validate TextBox value against the Regex.
  var isValid = window.evaluateStringAgainstSdsRequirements(
    value,
    "string-adheres-to-identifier-conventions"
  );
  if (!isValid && value.trim() !== "") {
    $(ev).addClass("invalid");
    $("#para-" + id).css("display", "block");
  } else {
    $(ev).removeClass("invalid");
    $("#para-" + id).css("display", "none");
  }
};

const addNewIDToTable = (newID, secondaryID, type) => {
  var message = "";
  if (type === "subjects") {
    var keyword = "subject";
    var int = 1;
    var table = document.getElementById("table-subjects");
  } else if (type === "samples") {
    var keyword = "sample";
    var int = 2;
    var table = document.getElementById("table-samples");
  }
  var duplicate = false;
  var rowcount = table.rows.length;
  for (var i = 1; i < rowcount; i++) {
    if (newID === table.rows[i].cells[int].innerText) {
      duplicate = true;
      break;
    }
  }
  if (duplicate) {
    var message = `We detect duplicate ${keyword}_id(s). Please make sure ${keyword}_id(s) are unique before you generate.`;
  }
  var rowIndex = rowcount;
  var indexNumber = rowIndex;
  var currentRow = table.rows[table.rows.length - 1];
  // check for unique row id in case users delete old rows and append new rows (same IDs!)
  var newRowIndex = window.checkForUniqueRowID("row-current-" + keyword, rowIndex);
  if (type === "subjects") {
    var row = (table.insertRow(rowIndex).outerHTML =
      "<tr id='row-current-" +
      keyword +
      newRowIndex +
      "' class='row-" +
      type +
      "'><td class='contributor-table-row'>" +
      indexNumber +
      "</td><td>" +
      newID +
      "</td><td><div class='ui small basic icon buttons contributor-helper-buttons' style='display: flex'><button class='ui button' onclick='window.edit_current_" +
      keyword +
      "_id(this)'><i class='pen icon' style='color: var(--tagify-dd-color-primary)'></i></button><button class='ui button' onclick='window.copy_current_" +
      keyword +
      "_id(this)'><i class='fas fa-copy' style='color: orange'></i></button><button class='ui button' onclick='window.delete_current_" +
      keyword +
      "_id(this)'><i class='trash alternate outline icon' style='color: red'></i></button></div></td></tr>");
  } else if (type === "samples") {
    console.log("In samples ttypes")
    var row = (table.insertRow(rowIndex).outerHTML =
      "<tr id='row-current-" +
      keyword +
      newRowIndex +
      "' class='row-" +
      type +
      "'><td class='contributor-table-row'>" +
      indexNumber +
      "</td><td>" +
      secondaryID +
      "</td><td>" +
      newID +
      "</td><td><div class='ui small basic icon buttons contributor-helper-buttons' style='display: flex'><button class='ui button' onclick='window.edit_current_" +
      keyword +
      "_id(this)'><i class='pen icon' style='color: var(--tagify-dd-color-primary)'></i></button><button class='ui button' onclick='window.copy_current_" +
      keyword +
      "_id(this)'><i class='fas fa-copy' style='color: orange'></i></button><button class='ui button' onclick='window.delete_current_" +
      keyword +
      "_id(this)'><i class='trash alternate outline icon' style='color: red'></i></button></div></td></tr>");
  }
  return message;
};

const addNewIDToTableStrict = (newID, secondaryID, type) => {
  var message = "";
  if (type === "subjects") {
    var keyword = "subject";
    var int = 1;
    var table = document.getElementById("table-subjects");
  } else if (type === "samples") {
    var keyword = "sample";
    var int = 2;
    var table = document.getElementById("table-samples");
  }
  var duplicate = false;
  var rowcount = table.rows.length;
  for (var i = 1; i < rowcount; i++) {
    if (newID === table.rows[i].cells[int].innerText) {
      duplicate = true;
      break;
    }
  }
  if (duplicate) {
    var message = `We detect duplicate ${keyword}_id(s). Please make sure ${keyword}_id(s) are unique before you generate.`;
  }
  return message;
};

const addSubjectIDtoDataBase = (id) => {
  var table = document.getElementById("table-subjects");
  var duplicate = false;
  var error = "";
  var rowcount = table.rows.length;
  for (var i = 1; i < rowcount; i++) {
    if (id === table.rows[i].cells[1].innerText) {
      duplicate = true;
      break;
    }
  }
  if (!duplicate) {
    var message = addNewIDToTable(id, null, "subjects");
    addSubjectIDToJSON(id);
  } else {
    error =
      "A similar subject_id already exists. Please either delete the existing subject_id or choose a different subject_id.";
  }

  if (error !== "") {
    Swal.fire("Failed to add the subject", error, "error");
  }
};

const addSampleIDtoDataBase = (samID, subID) => {
  var table = document.getElementById("table-samples");
  var duplicate = false;
  var error = "";
  var rowcount = table.rows.length;
  for (var i = 1; i < rowcount; i++) {
    if (samID === table.rows[i].cells[2].innerText) {
      duplicate = true;
      break;
    }
  }
  if (!duplicate) {
    var message = addNewIDToTable(samID, subID, "samples");
    addSampleIDtoJSON(samID);
  } else {
    error =
      "A similar sample_id already exists. Please either delete the existing sample_id or choose a different sample_id.";
  }

  if (error !== "") {
    Swal.fire("Failed to add the sample", error, "error");
  }
};

window.clearAllSubjectFormFields = (form) => {
  for (var field of $(form).children().find("input")) {
    $(field).val("");
  }
  for (var field of $(form).children().find("select")) {
    $(field).val("Select");
  }
  $(form).find(".title").removeClass("active");
  $(form).find(".content").removeClass("active");

  // hide Strains and Species
  if (form === subjectsFormDiv || form === window.guidedSubjectsFormDiv) {
    let curationModeSelectorPrefix = "";
    if (form === subjectsFormDiv) {
      curationModeSelectorPrefix = "";
    }
    if (form === window.guidedSubjectsFormDiv) {
      curationModeSelectorPrefix = "guided-";
    }

    var keyword = "subject";
    $(`#${curationModeSelectorPrefix}bootbox-${keyword}-species`).css("display", "none");
    $(`#${curationModeSelectorPrefix}bootbox-${keyword}-strain`).css("display", "none");

    if (form === window.guidedSubjectsFormDiv) {
      guidedSetStrainRRID("");
    }

    $(`#${curationModeSelectorPrefix}button-add-species-${keyword}`).html(
      `<svg xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle" width="14" height="14" fill="currentColor" class="bi bi-plus" viewBox="0 0 16 16"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/></svg>Add species`
    );
    $(`#${curationModeSelectorPrefix}button-add-strain-${keyword}`).html(
      `<svg xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle" width="14" height="14" fill="currentColor" class="bi bi-plus" viewBox="0 0 16 16"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/></svg>Add strain`
    );
  }
};

// add new subject ID to JSON file (main file to be converted to excel)
const addSubjectIDToJSON = (subjectID) => {
  if ($("#form-add-a-subject").length > 0) {
    addSubjectMetadataEntriesIntoJSON("free-form");
  }
};

/// function to add Species - subjects + samples
window.addSpecies = async (ev, type, curationMode) => {
  let curationModeSelectorPrefix = "";
  if (curationMode == "guided") {
    curationModeSelectorPrefix = "guided-";
  }

  if (curationMode == "guided") {
    guidedSetStrainRRID("");
  }
  const { value: value } = await Swal.fire({
    title: "Add/Edit a species",
    html: `<input type="text" id="sweetalert-${type}-species" placeholder="Search for species..." style="font-size: 14px;"/>`,
    focusConfirm: false,
    showCancelButton: true,
    heightAuto: false,
    backdrop: "rgba(0,0,0, 0.4)",
    customClass: {
      confirmButton: "confirm-disabled",
    },
    didOpen: () => {
      $(".swal2-confirm").attr("id", "btn-confirm-species");
      window.createSpeciesAutocomplete(`sweetalert-${type}-species`, curationMode);
    },
    preConfirm: () => {
      if (document.getElementById(`sweetalert-${type}-species`).value === "") {
        Swal.showValidationMessage("Please enter a species.");
      }
      return document.getElementById(`sweetalert-${type}-species`).value;
    },
  });
  if (value) {
    if (value !== "") {
      $(`#${curationModeSelectorPrefix}bootbox-${type}-species`).val(value);
      window.switchSpeciesStrainInput("species", "edit", curationMode);
    }
  } else {
    window.switchSpeciesStrainInput("species", "add", curationMode);
  }
};

window.switchSpeciesStrainInput = (type, mode, curationMode) => {
  let curationModeSelectorPrefix = "";
  if (curationMode == "guided") {
    curationModeSelectorPrefix = "guided-";
  }
  if (mode === "add") {
    $(`#${curationModeSelectorPrefix}button-add-${type}-subject`).html(
      `<svg xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle" width="14" height="14" fill="currentColor" class="bi bi-plus" viewBox="0 0 16 16"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/></svg>Add ${type}`
    );
    $(`#${curationModeSelectorPrefix}bootbox-subject-${type}`).css("display", "none");
    $(`#${curationModeSelectorPrefix}bootbox-subject-${type}`).val("");
  } else if (mode === "edit") {
    $(`#${curationModeSelectorPrefix}bootbox-subject-${type}`).css("display", "block");
    $(`#${curationModeSelectorPrefix}bootbox-subject-${type}`).attr("readonly", true);
    $(`#${curationModeSelectorPrefix}bootbox-subject-${type}`).css("background", "#f5f5f5");
    $(`#${curationModeSelectorPrefix}button-add-${type}-subject`).html(
      "<i class='pen icon'></i>Edit"
    );
  }
};

const guidedSetStrainRRID = (RRID) => {
  const rridLabel = document.getElementById("guided-strain-rrid-label");
  const rridInput = document.getElementById("guided-bootbox-subject-strain-RRID");

  if (!RRID) {
    rridLabel.classList.add("hidden");
    rridInput.classList.add("hidden");
    rridInput.value = "";
    return;
  }

  rridLabel.classList.remove("hidden");
  rridInput.classList.remove("hidden");
  rridInput.value = RRID;
};

window.addStrain = async (ev, type, curationMode) => {
  let curationModeSelectorPrefix = "";
  if (curationMode == "guided") {
    curationModeSelectorPrefix = "guided-";
  }

  $(`#${curationModeSelectorPrefix}bootbox-${type}-strain`).val("");
  if (curationMode == "guided") {
    guidedSetStrainRRID("");
  }

  const { value: value } = await Swal.fire({
    title: "Add/Edit a strain",
    html: `<input type="text" id="sweetalert-${type}-strain" placeholder="Search for strain..." style="font-size: 14px;"/>`,
    focusConfirm: false,
    showCancelButton: true,
    heightAuto: false,
    backdrop: "rgba(0,0,0, 0.4)",
    customClass: {
      confirmButton: "confirm-disabled",
    },
    didOpen: () => {
      $(".swal2-confirm").attr("id", "btn-confirm-strain");
      window.createStrain("sweetalert-" + type + "-strain", type, curationMode);
    },
    preConfirm: () => {
      if (document.getElementById("sweetalert-" + type + "-strain").value === "") {
        Swal.showValidationMessage("Please enter a strain.");
      }
      return document.getElementById("sweetalert-" + type + "-strain").value;
    },
  });
  if (value) {
    if (value !== "") {
      $(`#${curationModeSelectorPrefix}bootbox-${type}-strain`).val(value);
      window.switchSpeciesStrainInput("strain", "edit", curationMode);
    }
  } else {
    window.switchSpeciesStrainInput("strain", "add", curationMode);
  }
};

// populate RRID
window.populateRRID = async (strain, type, curationMode) => {
  Swal.fire({
    title: `Retrieving RRID for ${strain}...`,
    allowEscapeKey: false,
    allowOutsideClick: false,
    html: "Please wait...",
    heightAuto: false,
    backdrop: "rgba(0,0,0, 0.4)",
    timerProgressBar: true,
    didOpen: () => {
      Swal.showLoading();
    },
  })

  let curationModeSelectorPrefix = "";
  if (curationMode == "guided") {
    curationModeSelectorPrefix = "guided-";
  }

  let rridHostname = "scicrunch.org";
  // this is to handle spaces and other special characters in strain name
  let encodedStrain = encodeURIComponent(strain);
  let rridInfo = {
    hostname: rridHostname,
    port: 443,
    path: `/api/1/dataservices/federation/data/nlx_154697-1?q=${encodedStrain}&key=2YOfdcQRDVN6QZ1V6x3ZuIAsuypusxHD`,
    headers: { accept: "text/xml" },
  };

  try {
    let data = await window.electron.ipcRenderer.invoke("getStrainData", rridInfo)
    var returnRes = readXMLScicrunch(data, type, curationMode);
    if (!returnRes) {
      Swal.fire({
        title: `Failed to retrieve the RRID for ${strain} from <a target="_blank" href="https://scicrunch.org/resources/Organisms/search">Scicrunch.org</a>.`,
        text: "Please make sure you enter the correct strain.",
        showCancelButton: false,
        heightAuto: false,
        backdrop: "rgba(0,0,0, 0.4)",
      });
      $(`#${curationModeSelectorPrefix}bootbox-${type}-strain`).val("");
      $(`#${curationModeSelectorPrefix}bootbox-${type}-strain-RRID`).val("");
      $(`#${curationModeSelectorPrefix}bootbox-${type}-strain`).css("display", "none");
      if (type.includes("subject")) {
        $(`#${curationModeSelectorPrefix}button-add-strain-subject`).html(
          `<svg xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle" width="14" height="14" fill="currentColor" class="bi bi-plus" viewBox="0 0 16 16"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/></svg>Add strain`
        );
      } else {
        $(`#${curationModeSelectorPrefix}button-add-strain-subject`).html(
          `<svg xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle" width="14" height="14" fill="currentColor" class="bi bi-plus" viewBox="0 0 16 16"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/></svg>Add strain`
        );
      }
    } else {
      $(`#${curationModeSelectorPrefix}bootbox-${type}-strain`).val(strain);
      $("#btn-confirm-strain").removeClass("confirm-disabled");
      $(`#${curationModeSelectorPrefix}bootbox-${type}-strain`).css("display", "block");
      $(`#${curationModeSelectorPrefix}bootbox-${type}-strain`).attr("readonly", true);
      $(`#${curationModeSelectorPrefix}bootbox-${type}-strain`).css("background", "#f5f5f5");
      if (type.includes("subject")) {
        $(`#${curationModeSelectorPrefix}button-add-strain-subject`).html(
          "<i class='pen icon'></i>Edit"
        );
      } else {
        $(`#${curationModeSelectorPrefix}button-add-strain-sample`).html(
          "<i class='pen icon'></i>Edit"
        );
      }
      Swal.fire({
        title: `Successfully retrieved the RRID for "${strain}".`,
        icon: "success",
        heightAuto: false,
        backdrop: "rgba(0,0,0, 0.4)",
      })
    }
}   catch (err) {
    console.log(err)
    $(`#${curationModeSelectorPrefix}bootbox-${type}-strain`).val("");
    $(`#${curationModeSelectorPrefix}bootbox-${type}-strain-RRID`).val("");
    Swal.fire({
      title: `Failed to retrieve the RRID for "${strain}" from <a target="_blank" href="https://scicrunch.org/resources/Organisms/search">Scicrunch.org</a>.`,
      text: "Please check your Internet Connection or contact us at help@fairdataihub.org",
      showCancelButton: false,
      heightAuto: false,
      backdrop: "rgba(0,0,0, 0.4)",
    });
  }
};

const addSubjectMetadataEntriesIntoJSON = (curationMode) => {
  let curationModeSelectorPrefix;
  let dataLength = window.subjectsTableData.length;

  if (curationMode === "free-form") {
    curationModeSelectorPrefix = "";
  }
  if (curationMode === "guided") {
    curationModeSelectorPrefix = "guided-";
  }
  var valuesArr = [];
  headersArrSubjects = [];
  for (var field of $(`#${curationModeSelectorPrefix}form-add-a-subject`)
    .children()
    .find(".subjects-form-entry")) {
    if (field.value === "" || field.value === undefined || field.value === "Select") {
      field.value = null;
    } else {
    }
    headersArrSubjects.push(field.name);
    // if it's age, then add age info input (day/week/month/year)
    if (field.name === "Age") {
      if (
        $(`#${curationModeSelectorPrefix}bootbox-subject-age-info`).val() !== "Select" &&
        $(`#${curationModeSelectorPrefix}bootbox-subject-age-info`).val() !== "N/A"
      ) {
        field.value =
          field.value + " " + $(`#${curationModeSelectorPrefix}bootbox-subject-age-info`).val();
      } else {
        field.value = field.value;
      }
    }
    if (field.name === "Sex") {
      if ($(`#${curationModeSelectorPrefix}bootbox-subject-sex`).val() === "Unknown") {
        field.value = "";
      } else {
        field.value = field.value;
      }
    }
    valuesArr.push(field.value);
  }
  window.subjectsTableData[0] = headersArrSubjects;

  if (valuesArr !== undefined && valuesArr.length !== 0) {
    if (curationMode === "free-form") {
      if (window.subjectsTableData[dataLength] !== undefined) {
        window.subjectsTableData[dataLength + 1] = valuesArr;
      } else {
        window.subjectsTableData[dataLength] = valuesArr;
      }
    }
    if (curationMode === "guided") {
      let subjectID = document.getElementById("guided-bootbox-subject-id").value;
      //Overwrite existing subject data with new subject data
      for (let i = 1; i < window.subjectsTableData.length; i++) {
        if (window.subjectsTableData[i][0] === subjectID) {
          window.subjectsTableData[i] = valuesArr;
        }
      }
    }
  }
  if (curationMode === "free-form") {
    $("#table-subjects").css("display", "block");
    $("#button-generate-subjects").css("display", "block");
    window.clearAllSubjectFormFields(subjectsFormDiv);
    hideForm("subject");
  }
};

const addSampleMetadataEntriesIntoJSON = (curationMode) => {
  let curationModeSelectorPrefix = "";
  var dataLength = window.samplesTableData.length;
  if (curationMode === "free-form") {
    curationModeSelectorPrefix = "";
  }
  if (curationMode === "guided") {
    curationModeSelectorPrefix = "guided-";
  }
  var valuesArr = [];
  headersArrSamples = [];
  for (var field of $(`#${curationModeSelectorPrefix}form-add-a-sample`)
    .children()
    .find(".samples-form-entry")) {
    if (field.value === "" || field.value === undefined || field.value === "Select") {
      field.value = null;
    }
    headersArrSamples.push(field.name);
    // if it's age, then add age info input (day/week/month/year)
    if (field.name === "Age") {
      if (
        $(`#${curationModeSelectorPrefix}bootbox-sample-age-info`).val() !== "Select" &&
        $(`#${curationModeSelectorPrefix}bootbox-sample-age-info`).val() !== "N/A"
      ) {
        field.value =
          field.value + " " + $(`#${curationModeSelectorPrefix}#bootbox-sample-age-info`).val();
      } else {
        field.value = field.value;
      }
    }
    valuesArr.push(field.value);
  }
  window.samplesTableData[0] = headersArrSamples;
  if (valuesArr !== undefined && valuesArr.length !== 0) {
    if (curationMode === "free-form") {
      if (window.samplesTableData[dataLength] !== undefined) {
        window.samplesTableData[dataLength + 1] = valuesArr;
      } else {
        window.samplesTableData[dataLength] = valuesArr;
      }
    }
  }
  if (curationMode === "guided") {
    let subjectID = document.getElementById("guided-bootbox-subject-id-samples").value;
    let sampleID = document.getElementById("guided-bootbox-sample-id").value;
    for (let i = 1; i < window.samplesTableData.length; i++) {
      if (window.samplesTableData[i][0] === subjectID && window.samplesTableData[i][1] === sampleID) {
        window.samplesTableData[i] = valuesArr;
        break;
      }
    }
  }
  if (curationMode === "free-form") {
    $("#table-samples").css("display", "block");
    $("#button-generate-samples").css("display", "block");
    window.clearAllSubjectFormFields(samplesFormDiv);
    hideForm("sample");
  }
};

const addSampleIDtoJSON = (sampleID) => {
  if ($("#form-add-a-sample").length > 0) {
    addSampleMetadataEntriesIntoJSON("free-form");
  }
};

// associated with the edit icon (edit a subject)
window.edit_current_subject_id = (ev) => {
  var currentRow = $(ev).parents()[2];
  var subjectID = $(currentRow)[0].cells[1].innerText;
  loadSubjectInformation(ev, subjectID);
};
window.edit_current_sample_id = (ev) => {
  var currentRow = $(ev).parents()[2];
  var subjectID = $(currentRow)[0].cells[1].innerText;
  var sampleID = $(currentRow)[0].cells[2].innerText;
  loadSampleInformation(ev, subjectID, sampleID);
};
window.edit_current_protocol_id = async (ev) => {
  let oldProtocolLink = "";
  var currentRow = $(ev).parents()[2];
  var link = $(currentRow)[0].cells[1].innerText;
  var type = $(currentRow)[0].cells[2].innerText;
  var relation = $(currentRow)[0].cells[3].innerText;
  var desc = $(currentRow)[0].cells[4].innerText;
  let protocolLink = "";

  const { value: values } = await Swal.fire({
    title: "Edit protocol",
    html:
      '<label>Protocol URL: <i class="fas fa-info-circle swal-popover" data-content="URLs (if still private) / DOIs (if public) of protocols from protocols.io related to this dataset.<br />Note that at least one \'Protocol URLs or DOIs\' link is mandatory."rel="popover"data-placement="right"data-html="true"data-trigger="hover"></i></label><input id="DD-protocol-link" class="swal2-input" placeholder="Enter a URL" value="' +
      link +
      '"/>' +
      '<label>Protocol description: <i class="fas fa-info-circle swal-popover" data-content="Provide a short description of the link."rel="popover"data-placement="right"data-html="true"data-trigger="hover"></i></label><textarea id="DD-protocol-description" class="swal2-textarea" placeholder="Enter a description">' +
      desc +
      "</textarea>",
    focusConfirm: false,
    width: "38rem",
    showCancelButton: true,
    heightAuto: false,
    backdrop: "rgba(0,0,0, 0.4)",
    reverseButtons: window.reverseSwalButtons,
    didOpen: () => {
      $("#DD-protocol-link-select").val(type);
      $("#DD-protocol-link-relation").val(relation);
      oldProtocolLink = $("#DD-protocol-link").val();
    },
    preConfirm: () => {
      let link = $("#DD-protocol-link").val();
      let protocolEdited = oldProtocolLink !== link;
      if ($("#DD-protocol-link").val() === "") {
        Swal.showValidationMessage(`Please enter a link!`);
      } else {
        if (protocolEdited) {
          if (doiRegex.declared({ exact: true }).test(link) === true) {
            //format must begin with doi:
            //example: doi:10.1000/xyz000
            protocolLink = "DOI";
          } else {
            //check if link is a valid URL
            if (validator.isURL(link) != true) {
              Swal.showValidationMessage("Please enter a valid link");
            } else {
              if (link.includes("doi")) {
                //link is valid url and checks for 'doi' in link
                protocolLink = "DOI";
              } else {
                protocolLink = "URL";
              }
            }
          }
        }
      }

      if ($("#DD-protocol-description").val() === "") {
        Swal.showValidationMessage(`Please enter a short description!`);
      }

      if (protocolEdited) {
        let duplicate = window.checkLinkDuplicate(
          $("#DD-protocol-link").val(),
          document.getElementById("protocol-link-table-dd")
        );
        if (duplicate) {
          Swal.showValidationMessage(
            "Duplicate protocol. The protocol you entered is already added."
          );
        }
      }

      //need to check for duplicates here
      return [
        $("#DD-protocol-link").val(),
        protocolLink,
        "IsProtocolFor",
        $("#DD-protocol-description").val(),
      ];
    },
  });

  if (values) {
    $(currentRow)[0].cells[1].innerHTML =
      "<a href='" + values[0] + "' target='_blank'>" + values[0] + "</a>";
    $(currentRow)[0].cells[2].innerHTML = values[1];
    $(currentRow)[0].cells[3].innerHTML = values[2];
    $(currentRow)[0].cells[4].innerText = values[3];
  }
};

window.edit_current_additional_link_id = async (ev) => {
  var currentRow = $(ev).parents()[2];
  var link = $(currentRow)[0].cells[1].innerText;
  var linkType = $(currentRow)[0].cells[2].innerText;
  var linkRelation = $(currentRow)[0].cells[3].innerText;
  var desc = $(currentRow)[0].cells[4].innerText;
  const { value: values } = await Swal.fire({
    title: "Edit link",
    html:
      '<label>URL or DOI: <i class="fas fa-info-circle swal-popover" data-content="Specify your actual URL (if resource is public) or DOI (if resource is private). This can be web links to repositories or papers (DOI)."rel="popover"data-placement="right"data-html="true"data-trigger="hover"></i></label><input id="DD-other-link" class="swal2-input" placeholder="Enter a URL" value="' +
      link +
      '"/>' +
      '<label>Relation to the dataset: <i class="fas fa-info-circle swal-popover" data-content="A prespecified list of relations for common URLs or DOIs used in SPARC datasets. </br> The value in this field must be read as the \'relationship that this dataset has to the specified URL/DOI\'."rel="popover"data-placement="right"data-html="true"data-trigger="hover"></i></label><select id="DD-other-link-relation" class="swal2-input"><option value="Select">Select a relation</option><option value="IsCitedBy">IsCitedBy</option><option value="Cites">Cites</option><option value="IsSupplementTo">IsSupplementTo</option><option value="IsSupplementedBy">IsSupplementedBy</option><option value="IsContinuedByContinues">IsContinuedByContinues</option><option value="IsDescribedBy">IsDescribedBy</option><option value="Describes">Describes</option><option value="HasMetadata">HasMetadata</option><option value="IsMetadataFor">IsMetadataFor</option><option value="HasVersion">HasVersion</option><option value="IsVersionOf">IsVersionOf</option><option value="IsNewVersionOf">IsNewVersionOf</option><option value="IsPreviousVersionOf">IsPreviousVersionOf</option><option value="IsPreviousVersionOf">IsPreviousVersionOf</option><option value="HasPart">HasPart</option><option value="IsPublishedIn">IsPublishedIn</option><option value="IsReferencedBy">IsReferencedBy</option><option value="References">References</option><option value="IsDocumentedBy">IsDocumentedBy</option><option value="Documents">Documents</option><option value="IsCompiledBy">IsCompiledBy</option><option value="Compiles">Compiles</option><option value="IsVariantFormOf">IsVariantFormOf</option><option value="IsOriginalFormOf">IsOriginalFormOf</option><option value="IsIdenticalTo">IsIdenticalTo</option><option value="IsReviewedBy">IsReviewedBy</option><option value="Reviews">Reviews</option><option value="IsDerivedFrom">IsDerivedFrom</option><option value="IsSourceOf">IsSourceOf</option><option value="IsRequiredBy">IsRequiredBy</option><option value="Requires">Requires</option><option value="IsObsoletedBy">IsObsoletedBy</option><option value="Obsoletes">Obsoletes</option></select>' +
      '<label>Link description: <i class="fas fa-info-circle swal-popover" data-content="Provide a short description of the link."rel="popover"data-placement="right"data-html="true"data-trigger="hover"></i></label><textarea id="DD-other-description" class="swal2-textarea" placeholder="Enter a description">' +
      desc +
      "</textarea>",
    focusConfirm: false,
    showCancelButton: true,
    reverseButtons: window.reverseSwalButtons,
    heightAuto: false,
    backdrop: "rgba(0,0,0, 0.4)",
    didOpen: () => {
      $("#DD-other-link-type").val(linkType);
      $("#DD-other-link-relation").val(linkRelation);
    },
    preConfirm: () => {
      if ($("#DD-other-link-type").val() === "Select") {
        Swal.showValidationMessage(`Please select a type of links!`);
      }
      if ($("#DD-other-link").val() === "") {
        Swal.showValidationMessage(`Please enter a link.`);
      }
      if ($("#DD-other-link-relation").val() === "Select") {
        Swal.showValidationMessage(`Please enter a link relation.`);
      }
      if ($("#DD-other-description").val() === "") {
        Swal.showValidationMessage(`Please enter a short description.`);
      }
      return [
        $("#DD-other-link").val(),
        $("#DD-other-link-type").val(),
        $("#DD-other-link-relation").val(),
        $("#DD-other-description").val(),
      ];
    },
  });
  if (values) {
    // $(currentRow)[0].cells[1].innerText = values[0];
    $(currentRow)[0].cells[1].innerHTML =
      "<a href='" + values[0] + "' target='_blank'>" + values[0] + "</a>";
    $(currentRow)[0].cells[2].innerText = values[1];
    $(currentRow)[0].cells[3].innerText = values[2];
    $(currentRow)[0].cells[4].innerText = values[3];
  }
};

const loadSubjectInformation = (ev, subjectID) => {
  // 1. load fields for form
  window.showForm("display", true);
  $("#btn-edit-subject").css("display", "inline-block");
  $("#btn-add-subject").css("display", "none");
  window.clearAllSubjectFormFields(subjectsFormDiv);
  window.populateForms(subjectID, "", "free-form");
  $("#btn-edit-subject").unbind("click");
  $("#btn-edit-subject").click(function () {
    editSubject(ev, subjectID);
  });
  $("#new-custom-header-name").keyup(function () {
    var customName = $(this).val().trim();
    if (customName !== "") {
      $("#button-confirm-custom-header-name").show();
    } else {
      $("#button-confirm-custom-header-name").hide();
    }
  });
};

window.populateForms = (subjectID, type, curationMode) => {
  //Initialize variables shared between different curation modes and set them
  //based on curationMode passed in as parameter
  let fieldArr;
  let curationModeSelectorPrefix;
  let infoJson;

  if (curationMode === "free-form") {
    curationModeSelectorPrefix = "";
    fieldArr = $(subjectsFormDiv).children().find(".subjects-form-entry");
  }
  if (curationMode === "guided") {
    curationModeSelectorPrefix = "guided-";
    fieldArr = $(window.guidedSubjectsFormDiv).children().find(".subjects-form-entry");
  }

  console.log(fieldArr)
  console.log(window.subjectsTableData)

  if (window.subjectsTableData.length > 1) {
    for (var i = 1; i < window.subjectsTableData.length; i++) {
      if (window.subjectsTableData[i][0] === subjectID) {
        infoJson = window.subjectsTableData[i];
        break;
      }
    }
  }

  console.log(infoJson)

  if (subjectID !== "clear" && subjectID.trim() !== "") {
    if (curationMode === "guided") {
      //Reset protocol title dropdowns to the default ("No protocols associated with this sample")
      const protocolTitleDropdown = document.getElementById(
        "guided-bootbox-subject-protocol-title"
      );
      const protocolURLDropdown = document.getElementById(
        "guided-bootbox-subject-protocol-location"
      );
      protocolTitleDropdown.value = "";
      protocolURLDropdown.value = "";
    }

    // populate form
    var emptyEntries = ["nan", "nat"];
    var c = fieldArr.map(function (i, field) {
      if (infoJson[i]) {
        if (!emptyEntries.includes(infoJson[i].toLowerCase())) {
          if (field.name === "Age") {
            var fullAge = infoJson[i].split(" ");
            var unitArr = ["hours", "days", "weeks", "months", "years"];
            var breakBoolean = false;
            field.value = fullAge[0];
            for (var unit of unitArr) {
              if (fullAge[1]) {
                if (unit.includes(fullAge[1].toLowerCase())) {
                  $(`#${curationModeSelectorPrefix}bootbox-subject-age-info`).val(unit);
                  breakBoolean = true;
                  break;
                }
                if (!breakBoolean) {
                  $(`#${curationModeSelectorPrefix}bootbox-subject-age-info`).val("N/A");
                }
              } else {
                $(`#${curationModeSelectorPrefix}bootbox-subject-age-info`).val("N/A");
              }
            }
          } else if (field.name === "Species" && infoJson[i] !== "") {
            $(`#${curationModeSelectorPrefix}bootbox-subject-species`).val(infoJson[i]);
            // manipulate the Add Strains/Species UI accordingly
            window.switchSpeciesStrainInput("species", "edit", curationMode);
          } else if (field.name === "Strain" && infoJson[i] !== "") {
            $(`#${curationModeSelectorPrefix}bootbox-subject-strain`).val(infoJson[i]);
            window.switchSpeciesStrainInput("strain", "edit", curationMode);
          } else if (curationMode === "guided" && field.name === "RRID for strain") {
            guidedSetStrainRRID(infoJson[i]);
          } else if (curationMode == "guided" && field.name === "protocol url or doi") {
            //If the selected sample derived from
            const previouslySavedProtocolURL = infoJson[i];

            const protocols = sodaJSONObj["dataset-metadata"]["description-metadata"]["protocols"];
            for (const protocol of protocols) {
              if (protocol.link === previouslySavedProtocolURL) {
                protocolTitleDropdown.value = protocol.description;
                protocolURLDropdown.value = protocol.link;
              }
            }
          } else {
            if (type === "import") {
              if (field.name === "subject id") {
                field.value = "";
              } else {
                field.value = infoJson[i];
              }
            } else {
              field.value = infoJson[i];
            }
          }
        } else {
          field.value = "";
        }
      } else {
        if (field.name === "Sex" && infoJson[i] === "") {
          $("#bootbox-subject-sex").val("Unknown");
        }
      }
    });
  }
};

window.populateFormsSamples = (subjectID, sampleID, type, curationMode) => {
  //Initialize variables shared between different curation modes and set them
  //based on curationMode passed in as parameter
  let fieldArr;
  let curationModeSelectorPrefix;
  let infoJson;

  if (curationMode === "free-form") {
    curationModeSelectorPrefix = "";
    fieldArr = $(samplesFormDiv).children().find(".samples-form-entry");
  }
  if (curationMode === "guided") {
    curationModeSelectorPrefix = "guided-";
    fieldArr = $(window.guidedSamplesFormDiv).children().find(".samples-form-entry");
  }
  if (window.samplesTableData.length > 1) {
    for (var i = 1; i < window.samplesTableData.length; i++) {
      if (window.samplesTableData[i][0] === subjectID && window.samplesTableData[i][1] === sampleID) {
        infoJson = window.samplesTableData[i];
        break;
      }
    }
  }

  if (sampleID !== "clear" && sampleID.trim() !== "") {
    // populate form
    var emptyEntries = ["nan", "nat"];
    var c = fieldArr.map(function (i, field) {
      if (infoJson[i]) {
        if (!emptyEntries.includes(infoJson[i].toLowerCase())) {
          if (field.name === "Age") {
            var fullAge = infoJson[i].split(" ");
            var unitArr = ["hours", "days", "weeks", "months", "years"];
            var breakBoolean = false;
            field.value = fullAge[0];
            if (fullAge[1]) {
              for (var unit of unitArr) {
                if (unit.includes(fullAge[1].toLowerCase())) {
                  $(`#${curationModePrefix}bootbox-sample-age-info`).val(unit);
                  breakBoolean = true;
                  break;
                }
                if (!breakBoolean) {
                  $(`#${curationModePrefix}bootbox-sample-age-info`).val("N/A");
                }
              }
            } else {
              $(`#${curationModePrefix}bootbox-sample-age-info`).val("N/A");
            }
          } else if (curationMode == "guided" && field.name === "was derived from") {
            //If the selected sample derived from still exists, select it
            //if not, reset the value
            const previouslySavedDerivedFromSample = infoJson[i];
            const wasDerivedFromDropdown = document.getElementById(
              "guided-bootbox-wasDerivedFromSample"
            );
            wasDerivedFromDropdown.value = "";
            for (const sample of wasDerivedFromDropdown.options) {
              if (sample.value === previouslySavedDerivedFromSample) {
                wasDerivedFromDropdown.value = sample.value;
              }
            }
          } else if (curationMode == "guided" && field.name === "protocol url or doi") {
            //If the selected sample derived from
            const previouslySavedProtocolURL = infoJson[i];
            const protocolTitleDropdown = document.getElementById(
              "guided-bootbox-sample-protocol-title"
            );
            const protocolURLDropdown = document.getElementById(
              "guided-bootbox-sample-protocol-location"
            );
            protocolTitleDropdown.value = "";
            protocolURLDropdown.value = "";

            const protocols = sodaJSONObj["dataset-metadata"]["description-metadata"]["protocols"];
            for (const protocol of protocols) {
              if (protocol.link === previouslySavedProtocolURL) {
                protocolTitleDropdown.value = protocol.description;
                protocolURLDropdown.value = protocol.link;
              }
            }
          } else {
            if (type === "import") {
              if (field.name === "subject id") {
                field.value = "";
              } else if (field.name === "sample id") {
                field.value = "";
              } else {
                field.value = infoJson[i];
              }
            } else {
              field.value = infoJson[i];
            }
          }
        } else {
          field.value = "";
        }
      }
    });
  }
};

const loadSampleInformation = (ev, subjectID, sampleID) => {
  // 1. load fields for form
  window.showFormSamples("display", true);
  $("#btn-edit-sample").css("display", "inline-block");
  $("#btn-add-sample").css("display", "none");
  window.clearAllSubjectFormFields(samplesFormDiv);
  window.populateFormsSamples(subjectID, sampleID, "", "free-form");
  $("#btn-edit-sample").unbind("click");
  $("#btn-edit-sample").click(function () {
    editSample(ev, sampleID);
  });
  $("#new-custom-header-name-samples").keyup(function () {
    var customName = $(this).val().trim();
    if (customName !== "") {
      $("#button-confirm-custom-header-name-samples").show();
    } else {
      $("#button-confirm-custom-header-name-samples").hide();
    }
  });
};

const editSubject = (ev, subjectID) => {
  for (var field of $("#form-add-a-subject").children().find(".subjects-form-entry")) {
    if (field.value.trim() !== "" && field.value !== undefined && field.value !== "Select") {
      // if it's age, then add age info input (day/week/month/year)
      if (field.name === "Age") {
        if ($("#bootbox-subject-age-info").val() !== "Select") {
          field.value = field.value + " " + $("#bootbox-subject-age-info").val();
        }
      }
      if (field.name === "Sex") {
        if ($("#bootbox-subject-sex").val() === "Unknown") {
          field.value = "";
        } else {
          field.value = field.value;
        }
      }
      window.subjectsFileData.push(field.value);
    } else {
      window.subjectsFileData.push("");
    }
  }
  var currentRow = $(ev).parents()[2];
  var newID = $("#bootbox-subject-id").val();
  if (newID === subjectID) {
    for (var i = 1; i < window.subjectsTableData.length; i++) {
      if (window.subjectsTableData[i][0] === subjectID) {
        window.subjectsTableData[i] = window.subjectsFileData;
        break;
      }
    }
    hideForm("subject");
  } else {
    var table = document.getElementById("table-subjects");
    var duplicate = false;
    var error = "";
    var rowcount = table.rows.length;
    for (var i = 1; i < rowcount; i++) {
      if (newID === table.rows[i].cells[1].innerText) {
        duplicate = true;
        break;
      }
    }
    if (duplicate) {
      error =
        "A similar subject_id already exists. Please either delete the existing subject_id or choose a different subject_id.";
      Swal.fire("Duplicate subject_id", error, "error");
    } else {
      for (var i = 1; i < window.subjectsTableData.length; i++) {
        if (window.subjectsTableData[i][0] === subjectID) {
          window.subjectsTableData[i] = window.subjectsFileData;
          break;
        }
      }
      $(currentRow)[0].cells[1].innerText = newID;
      hideForm("subject");
    }
  }
  window.subjectsFileData = [];
};

const editSample = (ev, sampleID) => {
  for (var field of $("#form-add-a-sample").children().find(".samples-form-entry")) {
    if (field.value.trim() !== "" && field.value !== undefined && field.value !== "Select") {
      window.samplesFileData.push(field.value);
    } else {
      window.samplesFileData.push("");
    }
  }
  var currentRow = $(ev).parents()[2];
  var newID = $("#bootbox-sample-id").val();
  if (newID === sampleID) {
    for (var i = 1; i < window.samplesTableData.length; i++) {
      if (window.samplesTableData[i][1] === sampleID) {
        window.samplesTableData[i] = window.samplesFileData;
        break;
      }
    }
    $(currentRow)[0].cells[1].innerText = window.samplesFileData[0];
    hideForm("sample");
  } else {
    var table = document.getElementById("table-samples");
    var duplicate = false;
    var error = "";
    var rowcount = table.rows.length;
    for (var i = 1; i < rowcount; i++) {
      if (newID === table.rows[i].cells[1].innerText) {
        duplicate = true;
        break;
      }
    }
    if (duplicate) {
      error =
        "A similar sample_id already exists. Please either delete the existing sample_id or choose a different sample_id.";
      Swal.fire("Duplicate sample_id", error, "error");
    } else {
      for (var i = 1; i < window.samplesTableData.length; i++) {
        if (window.samplesTableData[i][1] === sampleID) {
          window.samplesTableData[i] = window.samplesFileData;
          break;
        }
      }
      $(currentRow)[0].cells[1].innerText = newID;
      hideForm("sample");
    }
  }
  window.samplesFileData = [];
};

window.delete_current_subject_id = (ev) => {
  Swal.fire({
    title: "Are you sure you want to delete this subject?",
    showCancelButton: true,
    heightAuto: false,
    backdrop: "rgba(0,0,0, 0.4)",
    cancelButtonText: `No!`,
    cancelButtonColor: "#f44336",
    confirmButtonColor: "#3085d6",
    reverseButtons: window.reverseSwalButtons,
    confirmButtonText: "Yes",
  }).then((boolean) => {
    if (boolean.isConfirmed) {
      // 1. Delete from table
      var currentRow = $(ev).parents()[2];
      var currentRowid = $(currentRow).prop("id");
      document.getElementById(currentRowid).outerHTML = "";
      window.updateIndexForTable(document.getElementById("table-subjects"));
      // 2. Delete from JSON
      var subjectID = $(currentRow)[0].cells[1].innerText;
      for (var i = 1; i < window.subjectsTableData.length; i++) {
        if (window.subjectsTableData[i][0] === subjectID) {
          window.subjectsTableData.splice(i, 1);
          break;
        }
      }
    }
  });
};

window.delete_current_sample_id = (ev) => {
  Swal.fire({
    title: "Are you sure you want to delete this sample?",
    showCancelButton: true,
    heightAuto: false,
    backdrop: "rgba(0,0,0, 0.4)",
    cancelButtonText: `No!`,
    cancelButtonColor: "#f44336",
    confirmButtonColor: "#3085d6",
    reverseButtons: window.reverseSwalButtons,
    confirmButtonText: "Yes",
  }).then((boolean) => {
    if (boolean.isConfirmed) {
      // 1. Delete from table
      var currentRow = $(ev).parents()[2];
      var currentRowid = $(currentRow).prop("id");
      document.getElementById(currentRowid).outerHTML = "";
      window.updateIndexForTable(document.getElementById("table-samples"));
      // 2. Delete from JSON
      var sampleId = $(currentRow)[0].cells[1].innerText;
      for (var i = 1; i < window.samplesTableData.length; i++) {
        if (window.samplesTableData[i][1] === sampleId) {
          window.samplesTableData.splice(i, 1);
          break;
        }
      }
    }
  });
};

window.delete_current_protocol_id = (ev) => {
  Swal.fire({
    title: "Are you sure you want to delete this protocol?",
    showCancelButton: true,
    heightAuto: false,
    backdrop: "rgba(0,0,0, 0.4)",
    cancelButtonText: `No!`,
    cancelButtonColor: "#f44336",
    confirmButtonColor: "#3085d6",
    reverseButtons: window.reverseSwalButtons,
    confirmButtonText: "Yes",
  }).then((boolean) => {
    if (boolean.isConfirmed) {
      // 1. Delete from table
      var currentRow = $(ev).parents()[2];
      var currentRowid = $(currentRow).prop("id");
      document.getElementById(currentRowid).outerHTML = "";
      window.updateIndexForTable(document.getElementById("protocol-link-table-dd"));
    }
  });
};

window.delete_current_additional_link_id = (ev) => {
  Swal.fire({
    title: "Are you sure you want to delete this link?",
    showCancelButton: true,
    heightAuto: false,
    backdrop: "rgba(0,0,0, 0.4)",
    cancelButtonText: `No!`,
    cancelButtonColor: "#f44336",
    confirmButtonColor: "#3085d6",
    confirmButtonText: "Yes",
    reverseButtons: window.reverseSwalButtons,
  }).then((boolean) => {
    if (boolean.isConfirmed) {
      // 1. Delete from table
      var currentRow = $(ev).parents()[2];
      var currentRowid = $(currentRow).prop("id");
      document.getElementById(currentRowid).outerHTML = "";
      window.updateIndexForTable(document.getElementById("other-link-table-dd"));
    }
  });
};

window.copy_current_subject_id = async (ev) => {
  const { value: newSubject } = await Swal.fire({
    title: "Enter an ID for the new subject:",
    input: "text",
    showCancelButton: true,
    reverseButtons: window.reverseSwalButtons,
    heightAuto: false,
    backdrop: "rgba(0,0,0, 0.4)",
    inputValidator: (value) => {
      if (!value) {
        return "Please enter an ID";
      }
    },
  });
  if (newSubject && newSubject !== "") {
    // // add new row to table
    var message = addNewIDToTableStrict(newSubject, null, "subjects");
    if (message !== "") {
      Swal.fire(message, "", "warning");
    } else {
      var res = addNewIDToTable(newSubject, null, "subjects");
      // add new subject_id to JSON
      // 1. copy from current ev.id (the whole array)
      var currentRow = $(ev).parents()[2];
      var id = currentRow.cells[1].innerText;
      // 2. append that to the end of matrix
      for (var subArr of window.subjectsTableData.slice(1)) {
        if (subArr[0] === id) {
          var ind = window.subjectsTableData.indexOf(subArr);
          var newArr = [...window.subjectsTableData[ind]];
          window.subjectsTableData.push(newArr);
          // 3. change first entry of that array
          window.subjectsTableData[window.subjectsTableData.length - 1][0] = newSubject;
          break;
        }
      }
    }
  }
};

window.copy_current_sample_id = async (ev) => {
  const { value: newSubSam } = await Swal.fire({
    title: "Enter an ID for the new subject and sample: ",
    html:
      '<input id="new-subject" class="swal2-input" placeholder="Subject ID">' +
      '<input id="new-sample" class="swal2-input" placeholder="Sample ID">',
    focusConfirm: false,
    showCancelButton: true,
    heightAuto: false,
    backdrop: "rgba(0,0,0, 0.4)",
    preConfirm: () => {
      return [
        document.getElementById("new-subject").value,
        document.getElementById("new-sample").value,
      ];
    },
  });
  if (newSubSam && (newSubSam[0] !== "") & (newSubSam[1] !== "")) {
    var message = addNewIDToTableStrict(newSubSam[1], newSubSam[0], "samples");
    if (message !== "") {
      Swal.fire(message, "", "warning");
    } else {
      var res = addNewIDToTable(newSubSam[1], newSubSam[0], "samples");
      // // add new row to table
      // add new subject_id to JSON
      // 1. copy from current ev.id (the whole array)
      var currentRow = $(ev).parents()[2];
      var id1 = currentRow.cells[1].innerText;
      var id2 = currentRow.cells[2].innerText;
      // 2. append that to the end of matrix
      for (var samArr of window.samplesTableData.slice(1)) {
        if (samArr[0] === id1 && samArr[1] === id2) {
          var ind = window.samplesTableData.indexOf(samArr);
          var newArr = [...window.samplesTableData[ind]];
          window.samplesTableData.push(newArr);
          // 3. change first entry of that array
          window.samplesTableData[window.samplesTableData.length - 1][0] = newSubSam[0];
          window.samplesTableData[window.samplesTableData.length - 1][1] = newSubSam[1];
          break;
        }
      }
    }
  }
};

window.updateIndexForTable = (table, boolUpdateIndex) => {
  // disable table to prevent further row-moving action before the window.updateIndexForTable finishes

  if (table === document.getElementById("table-subjects")) {
    $("#table-subjects").css("pointer-events", "none");
  } else if (table === document.getElementById("table-samples")) {
    $("#table-samples").css("pointer-events", "none");
  }
  var rowcount = table.rows.length;
  var index = 1;
  if (boolUpdateIndex) {
    for (var i = 1; i < rowcount; i++) {
      table.rows[i].cells[0].innerText = index;
      index = index + 1;
    }
  }
  if (rowcount === 1) {
    table.style.display = "none";
    if (table === document.getElementById("table-subjects")) {
      $("#button-generate-subjects").css("display", "none");
    } else if (table === document.getElementById("table-samples")) {
      $("#button-generate-samples").css("display", "none");
    } else if (table === document.getElementById("table-current-contributors")) {
      document.getElementById("div-contributor-table-dd").style.display = "none";
    } else if (table === document.getElementById("protocol-link-table-dd")) {
      document.getElementById("protocol-link-table-dd").style.display = "none";
      document.getElementById("div-protocol-link-table-dd").style.display = "none";
    } else if (table === document.getElementById("guided-protocol-link-table-dd")) {
      document.getElementById("guided-protocol-link-table-dd").style.display = "none";
      document.getElementById("guided-div-protocol-link-table-dd").style.display = "none";
    } else if (table === document.getElementById("other-link-table-dd")) {
      document.getElementById("other-link-table-dd").style.display = "none";
      document.getElementById("div-other-link-table-dd").style.display = "none";
    } else if (table === document.getElementById("guided-other-link-table-dd")) {
      document.getElementById("guided-other-link-table-dd").style.display = "none";
      document.getElementById("guided-div-other-link-table-dd").style.display = "none";
    }
  }
  $("#table-subjects").css("pointer-events", "auto");
  $("#table-samples").css("pointer-events", "auto");
};

const updateOrderIDTable = (table, json, type) => {
  var length = table.rows.length;
  // 1. make a new json object - orderedTableData
  var orderedTableData = [];
  // 2. add headers as the first array
  orderedTableData[0] = json[0];
  // 3. loop through the UI table by index -> grab subject_id accordingly, find subject_id in json, append that to orderedSubjectsTableData
  i = 1;
  if (type === "subjects") {
    j = 0;
  } else if (type === "samples") {
    j = 1;
  }
  for (var index = 1; index < length; index++) {
    var id = table.rows[index].cells[j + 1].innerText;
    for (var ind of json.slice(1)) {
      if (ind[j] === id) {
        orderedTableData[i] = ind;
        i += 1;
        break;
      }
    }
  }
  if (type === "subjects") {
    window.subjectsTableData = orderedTableData;
  } else if (type === "samples") {
    window.samplesTableData = orderedTableData;
  }
};

const updateOrderContributorTable = (table, json) => {
  var length = table.rows.length;
  // 1. make a new json object - orderedTableData
  var orderedTableData = [];
  // 2. loop through the UI table by index -> grab subject_id accordingly, find subject_id in json, append that to orderedSubjectsTableData
  i = 0;
  for (var index = 1; index < length; index++) {
    var name = table.rows[index].cells[1].innerText;
    for (var con of json) {
      if (con.conName === name) {
        orderedTableData[i] = con;
        i += 1;
        break;
      }
    }
  }
  window.contributorArray = orderedTableData;
};

window.showPrimaryBrowseFolder = () => {
  window.electron.ipcRenderer.send("open-file-dialog-local-primary-folder");
};
window.showPrimaryBrowseFolderSamples = () => {
  window.electron.ipcRenderer.send("open-file-dialog-local-primary-folder-samples");
};

window.importPrimaryFolderSubjects = (folderPath) => {
  let headersArrSubjects = [];
  for (var field of $("#form-add-a-subject").children().find(".subjects-form-entry")) {
    if (field.value === "" || field.value === undefined || field.value === "Select") {
      field.value = null;
    }
    headersArrSubjects.push(field.name);
  }
  if (folderPath === "Browse here") {
    Swal.fire({
      title: "No folder chosen",
      text: "Please select a path to your primary folder.",
      heightAuto: false,
      backdrop: "rgba(0,0,0, 0.4)",
      icon: "error",
    });
  } else {
    if (window.path.parse(folderPath).base !== "primary") {
      Swal.fire({
        title: "Incorrect folder name",
        text: "Your folder must be named 'primary' to be imported to SODA.",
        heightAuto: false,
        backdrop: "rgba(0,0,0, 0.4)",
        icon: "error",
      });
    } else {
      var folders = window.fs.readdirSync(folderPath);
      var j = 1;
      window.subjectsTableData[0] = headersArrSubjects;
      for (var folder of folders) {
        window.subjectsFileData = [];
        var stats = window.fs.statSync(window.path.join(folderPath, folder));
        console.log(stats)
        if (stats.isDirectory) {
          window.subjectsFileData[0] = folder;
          for (var i = 1; i < 27; i++) {
            window.subjectsFileData.push("");
          }
          window.subjectsTableData[j] = window.subjectsFileData;
          j += 1;
        }
      }
      window.subjectsFileData = [];
      var subIDArray = [];
      // grab and confirm with users about their sub-ids
      for (var index of window.subjectsTableData.slice(1)) {
        subIDArray.push(index[0]);
      }
      Swal.fire({
        title: "Please confirm the subject id(s) below:",
        text: "The subject_ids are: " + subIDArray.join(", "),
        icon: "warning",
        heightAuto: false,
        backdrop: "rgba(0,0,0, 0.4)",
        showCancelButton: true,
        reverseButtons: window.reverseSwalButtons,
        showConfirmButton: true,
        confirmButtonText: "Yes, correct",
        cancelButtonText: "No",
        heightAuto: false,
        backdrop: "rgba(0,0,0, 0.4)",
      }).then((result) => {
        if (result.isConfirmed) {
          if (window.subjectsTableData.length > 1) {
            loadSubjectsDataToTable();
            $("#table-subjects").show();
            $("#div-import-primary-folder-subjects").hide();
          } else {
            Swal.fire(
              "Could not load subject IDs from the imported primary folder!",
              "Please check that you provided the correct path to a SPARC primary folder that has at least 1 subject folder.",
              "error"
            );
          }
        }
      });
    }
  }
};

const importPrimaryFolderSamples = (folderPath) => {
  headersArrSamples = [];
  for (var field of $("#form-add-a-sample").children().find(".samples-form-entry")) {
    if (field.value === "" || field.value === undefined || field.value === "Select") {
      field.value = null;
    }
    headersArrSamples.push(field.name);
  }
  // var folderPath = $("#primary-folder-destination-input-samples").prop("placeholder");
  if (folderPath === "Browse here") {
    Swal.fire({
      title: "No folder chosen",
      text: "Please select a path to your primary folder.",
      heightAuto: false,
      backdrop: "rgba(0,0,0, 0.4)",
      icon: "error",
    });
  } else {
    if (window.path.parse(folderPath).base !== "primary") {
      Swal.fire({
        title: "Incorrect folder name",
        text: "Your folder must be named 'primary' to be imported to SODA.",
        heightAuto: false,
        backdrop: "rgba(0,0,0, 0.4)",
        icon: "error",
      });
    } else {
      var folders = window.fs.readdirSync(folderPath);
      var j = 1;
      window.samplesTableData[0] = headersArrSamples;
      for (var folder of folders) {
        var statsSubjectID = window.fs.statSync(window.path.join(folderPath, folder));
        if (statsSubjectID.isDirectory()) {
          var subjectFolder = window.fs.readdirSync(window.path.join(folderPath, folder));
          for (var subfolder of subjectFolder) {
            var statsSampleID = window.fs.statSync(window.path.join(folderPath, folder, subfolder));
            if (statsSampleID.isDirectory()) {
              window.samplesFileData = [];
              window.samplesFileData[0] = folder;
              window.samplesFileData[1] = subfolder;
              for (var i = 2; i < 18; i++) {
                window.samplesFileData.push("");
              }
              window.samplesTableData[j] = window.samplesFileData;
              j += 1;
            }
          }
        }
      }
      window.samplesFileData = [];
      var subIDArray = [];
      var samIDArray = [];
      // grab and confirm with users about their sub-ids
      for (var index of window.samplesTableData.slice(1)) {
        subIDArray.push(index[0]);
        samIDArray.push(index[1]);
      }
      Swal.fire({
        title: "Please confirm the subject id(s) and sample id(s) below:",
        html:
          "The subject_id(s) are: " +
          subIDArray.join(", ") +
          "<br> The sample_id(s) are: " +
          samIDArray.join(", "),
        icon: "warning",
        showCancelButton: true,
        reverseButtons: window.reverseSwalButtons,
        showConfirmButton: true,
        confirmButtonText: "Yes, correct",
        cancelButtonText: "No",
        heightAuto: false,
        backdrop: "rgba(0,0,0, 0.4)",
      }).then((result) => {
        if (result.isConfirmed) {
          if (window.samplesTableData.length > 1) {
            loadSamplesDataToTable();
            $("#table-samples").show();
            $("#div-import-primary-folder-samples").hide();
            // $("#div-confirm-primary-folder-import-samples").hide();
            // $("#button-fake-confirm-primary-folder-load-samples").click();
          } else {
            Swal.fire(
              "Could not load samples IDs from the imported primary folder!",
              "Please check that you provided the correct path to a SPARC primary folder that has at least 1 subject folder and 1 sample folder.",
              "error"
            );
          }
        }
      });
    }
  }
};

const loadSubjectsDataToTable = () => {
  var iconMessage = "success";
  var showConfirmButtonBool = false;
  // var text =
  //   "Please add or edit your subject_id(s) in the following subjects table.";
  // delete table rows except headers
  $("#table-subjects tr:gt(0)").remove();
  for (var i = 1; i < window.subjectsTableData.length; i++) {
    var message = addNewIDToTable(window.subjectsTableData[i][0], null, "subjects");
  }
  if (message !== "") {
    Swal.fire({
      title: "Loaded successfully!",
      text: message,
      icon: "warning",
      showConfirmButton: true,
      heightAuto: false,
      backdrop: "rgba(0,0,0, 0.4)",
    });
  } else {
    Swal.fire({
      title: "Loaded successfully!",
      html: 'Add or edit your subject_id(s) in the following table. <br><br><b>Note</b>: Any value that does not follow SPARC standards (For example: Values for the fields: "Sex", "Age category", and "Handedness") will be not be imported by SODA.',
      icon: "success",
      showConfirmButton: true,
      heightAuto: false,
      backdrop: "rgba(0,0,0, 0.4)",
    });
  }
  Swal.fire({
    title: "Loaded successfully!",
    html: 'Add or edit your subject_id(s) in the following table. <br><br><b>Note</b>: Any value that does not follow SPARC standards (For example: Values for the fields: "Sex", "Age category", and "Handedness") will be not be imported by SODA.',
    icon: iconMessage,
    showConfirmButton: true,
    // timer: 1200,
    heightAuto: false,
    backdrop: "rgba(0,0,0, 0.4)",
  });
  $("#button-generate-subjects").css("display", "block");
  $("#div-import-primary-folder-subjects").hide();
};

const loadSamplesDataToTable = () => {
  // delete table rows except headers
  $("#table-samples tr:gt(0)").remove();
  for (var i = 1; i < window.samplesTableData.length; i++) {
    var message = addNewIDToTable(window.samplesTableData[i][1], window.samplesTableData[i][0], "samples");
  }
  if (message !== "") {
    Swal.fire({
      title: "Loaded successfully!",
      text: message,
      icon: "warning",
      showConfirmButton: true,
      heightAuto: false,
      backdrop: "rgba(0,0,0, 0.4)",
    });
  } else {
    Swal.fire({
      title: "Loaded successfully!",
      html: 'Add or edit your sample_id(s) in the following table. <br><br><b>Note</b>: Any value that does not follow SPARC standards (For example: Values for the fields: "Sample type", "Laterality", and "Plane of section") will be not be imported by SODA.',
      icon: "success",
      showConfirmButton: true,
      heightAuto: false,
      backdrop: "rgba(0,0,0, 0.4)",
    });
  }
  $("#button-generate-samples").css("display", "block");
  $("#div-import-primary-folder-samples").hide();
};

// functions below are to show/add/cancel a custom header
window.addCustomField = async (type, curationMode) => {
  let subjectsHeaderArray = null;
  let samplesHeaderArray = null;
  if (curationMode == "free-form") {
    subjectsHeaderArray = headersArrSubjects;
    samplesHeaderArray = headersArrSamples;
  }

  if (curationMode == "guided") {
    subjectsHeaderArray = window.subjectsTableData[0];
    samplesHeaderArray = window.samplesTableData[0];
  }

  if (type === "subjects") {
    var lowerCasedArray = $.map(subjectsHeaderArray, function (item, index) {
      return item.toLowerCase();
    });
    const { value: customField } = await Swal.fire({
      title: "Enter a custom field:",
      input: "text",
      showCancelButton: true,
      reverseButtons: window.reverseSwalButtons,
      heightAuto: false,
      backdrop: "rgba(0,0,0, 0.4)",
      inputValidator: (value) => {
        if (!value) {
          return "Please enter a custom field";
        } else {
          if (lowerCasedArray.includes(value.toLowerCase())) {
            return "Duplicate field name! <br> You entered a custom field that is already listed.";
          }
        }
      },
    });
    if (customField) {
      addCustomHeader("subjects", customField, curationMode);
      if (curationMode == "guided") {
        window.subjectsTableData[0].push(customField);
        for (let i = 1; i < window.subjectsTableData.length; i++) {
          window.subjectsTableData[i].push("");
        }
      }
    }
  } else if (type === "samples") {
    var lowerCasedArray = samplesHeaderArray.map((item) => {
      return item.toLowerCase();
    });

    const { value: customField } = await Swal.fire({
      title: "Enter a custom field:",
      input: "text",
      showCancelButton: true,
      reverseButtons: window.reverseSwalButtons,
      heightAuto: false,
      backdrop: "rgba(0,0,0, 0.4)",
      inputValidator: (value) => {
        if (!value) {
          return "Please enter a custom field";
        } else {
          if (samplesHeaderArray.includes(value.toLowerCase())) {
            return "Duplicate field name! <br> You entered a custom field that is already listed.";
          }
        }
      },
    });
    if (customField) {
      if (curationMode == "guided") {
        window.samplesTableData[0].push(customField);
        for (let i = 1; i < window.samplesTableData.length; i++) {
          window.samplesTableData[i].push("");
        }
      }
      addCustomHeader("samples", customField, curationMode);
    }
  }
};

const addCustomHeader = (type, customHeaderValue, curationMode) => {
  let curationModeSelectorPrefix = "";
  if (curationMode == "guided") {
    curationModeSelectorPrefix = "guided-";
  }
  var customName = customHeaderValue.trim();
  if (type === "subjects") {
    var divElement = `
      <div class="div-dd-info">
        <div class="demo-controls-head">
          <div style="width: 100%;">
            <font color="black">
              ${customName}
            </font>
          </div>
        </div>
        <div class="demo-controls-body">
          <div class="ui input modified">
            <input class="subjects-form-entry" type="text" placeholder="Type here..." id="bootbox-subject-${customName}" name="${customName}">
            </input>
          </div>
        </div>
        <div class="tooltipnew demo-controls-end">
          <svg onclick="window.deleteCustomField(this,'${customName}',0,'${curationMode}')" style="cursor: pointer;" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="red" class="bi bi-trash custom-fields" viewBox="0 0 16 16">
            <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
            <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
          </svg>
        </div>
      </div>
    `;

    $(`#${curationModeSelectorPrefix}accordian-custom-fields`).append(divElement);
    if (curationMode == "free-form") {
      headersArrSubjects.push(customName);
      // add empty entries for all of the other sub_ids to normalize the size of matrix
      for (var subId of window.subjectsTableData.slice(1, window.subjectsTableData.length)) {
        subId.push("");
      }
    }
  } else if (type === "samples") {
    var divElement = `
        <div class="div-dd-info">
          <div class="demo-controls-head">
            <div style="width: 100%;">
              <font color="black">
                ${customName}
              </font>
            </div>
          </div>
          <div class="demo-controls-body">
            <div class="ui input modified">
              <input class="samples-form-entry" type="text" placeholder="Type here..." id="bootbox-subject-${customName}" name="${customName}">
              </input>
            </div>
          </div>
          <div class="tooltipnew demo-controls-end">
            <svg onclick="window.deleteCustomField(this,'${customName}',1,'${curationMode}')" style="cursor: pointer;" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="red" class="bi bi-trash custom-fields" viewBox="0 0 16 16">
              <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
              <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
            </svg>
          </div>
        </div>
      `;
    $(`#${curationModeSelectorPrefix}accordian-custom-fields-samples`).append(divElement);
    if (curationMode == "free-form") {
      headersArrSamples.push(customName);
      // add empty entries for all of the other sub_ids to normalize the size of matrix
      for (var sampleId of window.samplesTableData.slice(1, window.samplesTableData.length)) {
        sampleId.push("");
      }
    }
  }
};

window.deleteCustomField = (ev, customField, category, curationMode) => {
  // category 0 => subjects;
  // category 1 => samples
  Swal.fire({
    text: "Are you sure you want to delete this custom field?",
    icon: "warning",
    showCancelButton: true,
    reverseButtons: window.reverseSwalButtons,
    heightAuto: false,
    backdrop: "rgba(0,0,0, 0.4)",
    confirmButtonText: "Yes",
  }).then((result) => {
    if (result.isConfirmed) {
      if (curationMode == "free-form") {
        $(ev).parents()[1].remove();
        if (category === 0) {
          if (headersArrSubjects.includes(customField)) {
            headersArrSubjects.splice(headersArrSubjects.indexOf(customField), 1);
          }
        } else {
          if (headersArrSamples.includes(customField)) {
            headersArrSamples.splice(headersArrSamples.indexOf(customField), 1);
          }
        }
      }
    }
    if (curationMode == "guided") {
      $(ev).parents()[1].remove();
      if (category === 0) {
        // get the index of the custom field in the window.subjectsTableData
        const indexToRemove = window.subjectsTableData[0].indexOf(customField);
        // remove the element at indexToRemove for each element in window.subjectsTableData
        for (let i = 0; i < window.subjectsTableData.length; i++) {
          window.subjectsTableData[i].splice(indexToRemove, 1);
        }
      }
    }
    if (category === 1) {
      // get the index of the custom field in the window.samplesTableData
      const indexToRemove = window.samplesTableData[0].indexOf(customField);
      // remove the element at indexToRemove for each element in window.samplesTableData
      for (let i = 0; i < window.samplesTableData.length; i++) {
        window.samplesTableData[i].splice(indexToRemove, 1);
      }
    }
  });
};

const addExistingCustomHeader = (customName) => {
  var divElement = `
    <div class="div-dd-info">
      <div class="demo-controls-head">
        <div style="width: 100%;">
          <font color="black">
            ${customName}
          </font>
        </div>
      </div>
      <div class="demo-controls-body">
        <div class="ui input modified">
          <input class="subjects-form-entry" type="text" placeholder="Type here..." id="bootbox-subject-${customName}" name="${customName}">
          </input>
        </div>
      </div>
      <div class="tooltipnew demo-controls-end">
        <svg onclick="window.deleteCustomField(this,'${customName}',0,'free-form')" style="cursor: pointer;" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="red" class="bi bi-trash custom-fields" viewBox="0 0 16 16">
          <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
          <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
        </svg>
      </div>
    </div>
  `;
  $("#accordian-custom-fields").append(divElement);
  headersArrSubjects.push(customName);
};

const addExistingCustomHeaderSamples = (customName) => {
  var divElement = `
    <div class="div-dd-info">
      <div class="demo-controls-head">
        <div style="width: 100%;">
          <font color="black">
            ${customName}
          </font>
        </div>
      </div>
      <div class="demo-controls-body">
        <div class="ui input modified">
          <input class="samples-form-entry" type="text" placeholder="Type here..." id="bootbox-subject-${customName}" name="${customName}">
          </input>
        </div>
      </div>
      <div class="tooltipnew demo-controls-end">
        <svg onclick="window.deleteCustomField(this,'${customName}',0,'free-form')" style="cursor: pointer;" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="red" class="bi bi-trash custom-fields" viewBox="0 0 16 16">
          <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
          <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
        </svg>
      </div>
    </div>
  `;
  $("#accordian-custom-fields-samples").append(divElement);
  headersArrSamples.push(customName);
};

window.subjectsDestinationPath = "";
window.samplesDestinationPath = "";

$(document).ready(function () {
  // loadExistingProtocolInfo();
  for (var field of $("#form-add-a-subject").children().find(".subjects-form-entry")) {
    if (field.value === "" || field.value === undefined || field.value === "Select") {
      field.value = null;
    }
    headersArrSubjects.push(field.name);
  }
  for (var field of $("#form-add-a-sample").children().find(".samples-form-entry")) {
    if (field.value === "" || field.value === undefined || field.value === "Select") {
      field.value = null;
    }
    headersArrSamples.push(field.name);
  }

  window.electron.ipcRenderer.on("selected-existing-subjects", (event, filepath) => {
    if (filepath.length > 0) {
      if (filepath != null) {
        document.getElementById("existing-subjects-file-destination").placeholder = filepath[0];
        window.electron.ipcRenderer.send(
          "track-event",
          "Success",
          "Prepare Metadata - Continue with existing subjects.xlsx",
          window.defaultBfDataset
        );
      } else {
        document.getElementById("existing-subjects-file-destination").placeholder = "Browse here";
        $("#div-confirm-existing-subjects-import").hide();
      }
    } else {
      document.getElementById("existing-subjects-file-destination").placeholder = "Browse here";
      $("#div-confirm-existing-subjects-import").hide();
    }
    if (
      document.getElementById("existing-subjects-file-destination").placeholder !== "Browse here"
    ) {
      $("#div-confirm-existing-subjects-import").show();
      $($("#div-confirm-existing-subjects-import button")[0]).show();
    } else {
      $("#div-confirm-existing-subjects-import").hide();
      $($("#div-confirm-existing-subjects-import button")[0]).hide();
    }
  });

  window.electron.ipcRenderer.on("selected-existing-samples", (event, filepath) => {
    if (filepath.length > 0) {
      if (filepath != null) {
        document.getElementById("existing-samples-file-destination").placeholder = filepath[0];
        // log the successful import to analytics
        window.logMetadataForAnalytics(
          "Success",
          window.MetadataAnalyticsPrefix.SAMPLES,
          window.AnalyticsGranularity.ACTION_AND_ACTION_WITH_DESTINATION,
          "Existing",
          Destinations.LOCAL
        );
      } else {
        document.getElementById("existing-samples-file-destination").placeholder = "Browse here";
        $("#div-confirm-existing-samples-import").hide();
      }
    } else {
      document.getElementById("existing-samples-file-destination").placeholder = "Browse here";
      $("#div-confirm-existing-samples-import").hide();
    }
    if (
      document.getElementById("existing-samples-file-destination").placeholder !== "Browse here"
    ) {
      $("#div-confirm-existing-samples-import").show();
      $($("#div-confirm-existing-samples-import button")[0]).show();
    } else {
      $("#div-confirm-existing-samples-import").hide();
      $($("#div-confirm-existing-samples-import button")[0]).hide();
    }
  });

  window.electron.ipcRenderer.on("selected-existing-DD", (event, filepath) => {
    if (filepath.length > 0) {
      if (filepath !== null) {
        document.getElementById("existing-dd-file-destination").placeholder = filepath[0];
        window.electron.ipcRenderer.send(
          "track-event",
          "Success",
          "Prepare Metadata - Continue with existing dataset_description.xlsx",
          window.defaultBfDataset
        );
        if (document.getElementById("existing-dd-file-destination").placeholder !== "Browse here") {
          $("#div-confirm-existing-dd-import").show();
          $($("#div-confirm-existing-dd-import button")[0]).show();
        } else {
          $("#div-confirm-existing-dd-import").hide();
          $($("#div-confirm-existing-dd-import button")[0]).hide();
        }
      } else {
        document.getElementById("existing-dd-file-destination").placeholder = "Browse here";
        $("#div-confirm-existing-dd-import").hide();
      }
    } else {
      document.getElementById("existing-dd-file-destination").placeholder = "Browse here";
      $("#div-confirm-existing-dd-import").hide();
    }
  });

  // generate subjects file
  window.electron.ipcRenderer.on("selected-destination-generate-subjects-locally", (event, dirpath) => {
    if (dirpath.length > 0) {
      document.getElementById("input-destination-generate-subjects-locally").placeholder =
        dirpath[0];
      var destinationPath = window.path.join(dirpath[0], "subjects.xlsx");
      window.subjectsDestinationPath = destinationPath;
      $("#div-confirm-destination-subjects-locally").css("display", "flex");
    }
  });

  // generate samples file
  window.electron.ipcRenderer.on("selected-destination-generate-samples-locally", (event, dirpath) => {
    if (dirpath.length > 0) {
      document.getElementById("input-destination-generate-samples-locally").placeholder =
        dirpath[0];
      var destinationPath = window.path.join(dirpath[0], "samples.xlsx");
      window.samplesDestinationPath = destinationPath;
      $("#div-confirm-destination-samples-locally").css("display", "flex");
    }
  });

  $("#bf_dataset_load_subjects").on("DOMSubtreeModified", function () {
    if (
      $("#Question-prepare-subjects-3").hasClass("show") &&
      !$("#Question-prepare-subjects-6").hasClass("show")
    ) {
      $("#Question-prepare-subjects-3").removeClass("show");
    }
    if ($("#bf_dataset_load_subjects").text().trim() !== "None") {
      $("#div-check-bf-import-subjects").css("display", "flex");
      $($("#div-check-bf-import-subjects").children()[0]).show();
    } else {
      $("#div-check-bf-import-subjects").css("display", "none");
    }
  });

  $("#bf_dataset_generate_subjects").on("DOMSubtreeModified", function () {
    if ($("#bf_dataset_generate_subjects").text().trim() !== "None") {
      $("#div-check-bf-generate-subjects").css("display", "flex");
    } else {
      $("#div-check-bf-generate-subjects").css("display", "none");
    }
  });

  $("#bf_dataset_load_samples").on("DOMSubtreeModified", function () {
    if (
      $("#Question-prepare-samples-3").hasClass("show") &&
      !$("#Question-prepare-samples-6").hasClass("show")
    ) {
      $("#Question-prepare-samples-3").removeClass("show");
    }
    if ($("#bf_dataset_load_samples").text().trim() !== "None") {
      $("#div-check-bf-import-samples").css("display", "flex");
      $($("#div-check-bf-import-samples").children()[0]).show();
    } else {
      $("#div-check-bf-import-samples").css("display", "none");
    }
  });
  $("#bf_dataset_generate_samples").on("DOMSubtreeModified", function () {
    if ($("#bf_dataset_generate_samples").text().trim() !== "None") {
      $("#div-check-bf-generate-samples").css("display", "flex");
    } else {
      $("#div-check-bf-generate-samples").css("display", "none");
    }
  });
});

window.showExistingSubjectsFile = () => {
  if ($("#existing-subjects-file-destination").prop("placeholder") !== "Browse here") {
    Swal.fire({
      title: "Are you sure you want to import a different subjects file?",
      text: "This will delete all of your previous work on this file.",
      showCancelButton: true,
      heightAuto: false,
      backdrop: "rgba(0,0,0, 0.4)",
      cancelButtonText: `No!`,
      cancelButtonColor: "#f44336",
      confirmButtonColor: "#3085d6",
      confirmButtonText: "Yes",
      icon: "warning",
      reverseButtons: window.reverseSwalButtons,
    }).then((boolean) => {
      if (boolean.isConfirmed) {
        window.electron.ipcRenderer.send("open-file-dialog-existing-subjects");
        document.getElementById("existing-subjects-file-destination").placeholder = "Browse here";
        $("#div-confirm-existing-subjects-import").hide();
        $($("#div-confirm-existing-subjects-import button")[0]).hide();
        $("#Question-prepare-subjects-3").removeClass("show");
      }
    });
  } else {
    window.electron.ipcRenderer.send("open-file-dialog-existing-subjects");
  }
};

window.showExistingSamplesFile = () => {
  if ($("#existing-samples-file-destination").prop("placeholder") !== "Browse here") {
    Swal.fire({
      title: "Are you sure you want to import a different samples file?",
      text: "This will delete all of your previous work on this file.",
      showCancelButton: true,
      heightAuto: false,
      backdrop: "rgba(0,0,0, 0.4)",
      cancelButtonText: `No!`,
      cancelButtonColor: "#f44336",
      confirmButtonColor: "#3085d6",
      confirmButtonText: "Yes",
      icon: "warning",
      reverseButtons: window.reverseSwalButtons,
    }).then((boolean) => {
      if (boolean.isConfirmed) {
        window.electron.ipcRenderer.send("open-file-dialog-existing-samples");
        document.getElementById("existing-samples-file-destination").placeholder = "Browse here";
        $("#div-confirm-existing-samples-import").hide();
        $($("#div-confirm-existing-samples-import button")[0]).hide();
        $("#Question-prepare-samples-3").removeClass("show");
      }
    });
  } else {
    window.electron.ipcRenderer.send("open-file-dialog-existing-samples");
  }
};

window.importExistingSubjectsFile = () => {
  var filePath = $("#existing-subjects-file-destination").prop("placeholder");
  if (filePath === "Browse here") {
    Swal.fire("No file chosen", "Please select a path to your subjects.xlsx file,", "error");

    // log the error to analytics
    window.logMetadataForAnalytics(
      "Error",
      window.MetadataAnalyticsPrefix.SUBJECTS,
      window.AnalyticsGranularity.ALL_LEVELS,
      "Existing",
      Destinations.LOCAL
    );
  } else {
    if (window.path.parse(filePath).base !== "subjects.xlsx") {
      Swal.fire({
        title: "Incorrect file name",
        text: "Your file must be named 'subjects.xlsx' to be imported to SODA.",
        heightAuto: false,
        backdrop: "rgba(0,0,0, 0.4)",
        icon: "error",
      });

      // log the error to analytics
      window.logMetadataForAnalytics(
        "Error",
        window.MetadataAnalyticsPrefix.SUBJECTS,
        window.AnalyticsGranularity.ALL_LEVELS,
        "Existing",
        Destinations.LOCAL
      );
    } else {
      Swal.fire({
        title: "Loading an existing subjects.xlsx file",
        html: "Please wait...",
        allowEscapeKey: false,
        allowOutsideClick: false,
        heightAuto: false,
        backdrop: "rgba(0,0,0, 0.4)",
        timerProgressBar: false,
        didOpen: () => {
          Swal.showLoading();
        },
      }).then((result) => {});
      setTimeout(loadSubjectsFileToDataframe, 1000, filePath);
    }
  }
};

window.importExistingSamplesFile = () => {
  var filePath = $("#existing-samples-file-destination").prop("placeholder");
  if (filePath === "Browse here") {
    Swal.fire("No file chosen", "Please select a path to your samples.xlsx file.", "error");

    // log the error to analytics
    window.logMetadataForAnalytics(
      "Error",
      window.MetadataAnalyticsPrefix.SAMPLES,
      window.AnalyticsGranularity.ALL_LEVELS,
      "Existing",
      Destinations.LOCAL
    );
  } else {
    if (window.path.parse(filePath).base !== "samples.xlsx") {
      Swal.fire({
        title: "Incorrect file name",
        text: "Your file must be named 'samples.xlsx' to be imported to SODA.",
        heightAuto: false,
        backdrop: "rgba(0,0,0, 0.4)",
        icon: "error",
      });

      // log the error to analytics
      window.logMetadataForAnalytics(
        "Error",
        window.MetadataAnalyticsPrefix.SAMPLES,
        window.AnalyticsGranularity.ALL_LEVELS,
        "Existing",
        Destinations.LOCAL
      );
    } else {
      Swal.fire({
        title: "Loading an existing samples.xlsx file",
        allowEscapeKey: false,
        allowOutsideClick: false,
        html: "Please wait...",
        // timer: 1500,
        heightAuto: false,
        backdrop: "rgba(0,0,0, 0.4)",
        timerProgressBar: false,
        didOpen: () => {
          Swal.showLoading();
        },
      }).then((result) => {});
      setTimeout(window.loadSamplesFileToDataframe(filePath), 1000);
    }
  }
};

window.checkBFImportSubjects = async () => {
  Swal.fire({
    title: "Importing the subjects.xlsx file",
    html: "Please wait...",
    timer: 15000,
    allowEscapeKey: false,
    allowOutsideClick: false,
    showConfirmButton: false,
    heightAuto: false,
    backdrop: "rgba(0,0,0, 0.4)",
    timerProgressBar: false,
    didOpen: () => {
      Swal.showLoading();
    },
  }).then((result) => {});
  var fieldEntries = [];
  for (var field of $("#form-add-a-subject").children().find(".subjects-form-entry")) {
    fieldEntries.push(field.name.toLowerCase());
  }
  let bfDataset = document.getElementById("bf_dataset_load_subjects").innerText.trim();

  log.info(`Getting subjects.xlsx for dataset ${bfDataset} from Pennsieve.`);
  try {
    let import_metadata_file = await client.get(`/prepare_metadata/import_metadata_file`, {
      params: {
        selected_account: window.defaultBfDataset,
        selected_dataset: bfDataset,
        file_type: "subjects.xlsx",
        ui_fields: fieldEntries.toString(),
      },
    });
    let res = import_metadata_file.data.subject_file_rows;

    // log the success to analytics
    window.logMetadataForAnalytics(
      "Success",
      window.MetadataAnalyticsPrefix.SUBJECTS,
      window.AnalyticsGranularity.ACTION_AND_ACTION_WITH_DESTINATION,
      "Existing",
      Destinations.PENNSIEVE
    );
    window.subjectsTableData = res;
    window.loadDataFrametoUI("bf");
  } catch (error) {
    clientError(error);
    Swal.fire({
      title: `Failed to load existing subjects.xlsx file`,
      backdrop: "rgba(0, 0, 0, 0.4)",
      heightAuto: false,
      icon: "warning",
      text: error.response.data.message,
    });

    // log the error to analytics
    window.logMetadataForAnalytics(
      "Error",
      window.MetadataAnalyticsPrefix.SUBJECTS,
      window.AnalyticsGranularity.ALL_LEVELS,
      "Existing",
      Destinations.PENNSIEVE
    );
  }
};

window.checkBFImportSamples = async () => {
  Swal.fire({
    title: "Importing the samples.xlsx file",
    html: "Please wait...",
    timer: 15000,
    allowEscapeKey: false,
    allowOutsideClick: false,
    showConfirmButton: false,
    heightAuto: false,
    backdrop: "rgba(0,0,0, 0.4)",
    timerProgressBar: false,
    didOpen: () => {
      Swal.showLoading();
    },
  }).then((result) => {});
  var fieldEntries = [];
  for (var field of $("#form-add-a-sample").children().find(".samples-form-entry")) {
    fieldEntries.push(field.name.toLowerCase());
  }

  let bfDataset = document.getElementById("bf_dataset_load_samples").innerText;

  log.info(`Getting samples.xlsx for dataset ${bfDataset} from Pennsieve.`);
  try {
    let importMetadataResponse = await client.get(`/prepare_metadata/import_metadata_file`, {
      params: {
        file_type: "samples.xlsx",
        selected_account: window.defaultBfDataset,
        selected_dataset: bfDataset,
        ui_fields: fieldEntries.toString(),
      },
    });

    let res = importMetadataResponse.data.sample_file_rows;

    // log the success to analytics
    window.logMetadataForAnalytics(
      "Success",
      window.MetadataAnalyticsPrefix.SAMPLES,
      window.AnalyticsGranularity.ACTION_AND_ACTION_WITH_DESTINATION,
      "Existing",
      Destinations.PENNSIEVE
    );
    window.samplesTableData = res;
    window.loadDataFrametoUISamples("bf");
  } catch (error) {
    clientError(error);
    Swal.fire({
      title: `Failed to load existing samples.xslx file`,
      backdrop: "rgba(0,0,0, 0.4)",
      heightAuto: false,
      icon: "warning",
      text: error.response.data.message,
    });

    // log the error to analytics
    window.logMetadataForAnalytics(
      "Error",
      window.MetadataAnalyticsPrefix.SAMPLES,
      window.AnalyticsGranularity.ALL_LEVELS,
      "Existing",
      Destinations.PENNSIEVE
    );
  }
};

window.loadDataFrametoUI = (type) => {
  var fieldSubjectEntries = [];
  for (var field of $("#form-add-a-subject").children().find(".subjects-form-entry")) {
    fieldSubjectEntries.push(field.name.toLowerCase());
  }
  // separate regular headers and custom headers
  const lowercasedHeaders = window.subjectsTableData[0].map((header) => header.toLowerCase());
  const customHeaders = [];
  for (var field of lowercasedHeaders) {
    if (!fieldSubjectEntries.includes(field)) {
      customHeaders.push(field);
    }
  }
  headersArrSubjects = headersArrSubjects.concat(customHeaders);
  for (var headerName of customHeaders) {
    addExistingCustomHeader(headerName);
  }
  // load sub-ids to table
  loadSubjectsDataToTable();
  $("#table-subjects").show();
  if (type === "local") {
    $("#div-confirm-existing-subjects-import").hide();
    $($("#div-confirm-existing-subjects-import button")[0]).hide();
    $("#button-fake-confirm-existing-subjects-file-load").click();
  } else {
    $("#div-check-bf-import-subjects").hide();
    $($("#div-check-bf-import-subjects button")[0]).hide();
    $("#button-fake-confirm-existing-bf-subjects-file-load").click();
    $($("#button-fake-confirm-existing-bf-subjects-file-load").siblings()[0]).hide();
  }
};

window.loadDataFrametoUISamples = (type) => {
  // separate regular headers and custom headers
  const lowercasedHeaders = window.samplesTableData[0].map((header) => header.toLowerCase());
  var fieldSampleEntries = [];
  for (var field of $("#form-add-a-sample").children().find(".samples-form-entry")) {
    fieldSampleEntries.push(field.name.toLowerCase());
  }
  const customHeaders = [];
  for (var field of lowercasedHeaders) {
    if (!fieldSampleEntries.includes(field)) {
      customHeaders.push(field);
    }
  }
  headersArrSamples = headersArrSamples.concat(customHeaders);
  for (var headerName of customHeaders) {
    addExistingCustomHeaderSamples(headerName);
  }
  // load sub-ids to table
  loadSamplesDataToTable();
  $("#table-samples").show();
  if (type === "local") {
    $("#div-confirm-existing-samples-import").hide();
    $($("#div-confirm-existing-samples-import button")[0]).hide();
    $("#button-fake-confirm-existing-samples-file-load").click();
  } else {
    $("#div-check-bf-import-samples").hide();
    $($("#div-check-bf-import-samples button")[0]).hide();
    $("#button-fake-confirm-existing-bf-samples-file-load").click();
    $($("#button-fake-confirm-existing-bf-samples-file-load").siblings()[0]).hide();
  }
};

window.addAdditionalLink = async () => {
  let protocolLink = ""
  const { value: values } = await Swal.fire({
    title: "Add additional link",
    html:
      '<label>URL or DOI: <i class="fas fa-info-circle swal-popover" data-content="Specify your actual URL (if resource is public) or DOI (if resource is private). This can be web links to repositories or papers (DOI)."rel="popover"data-placement="right"data-html="true"data-trigger="hover"></i></label><input id="DD-other-link" class="swal2-input" placeholder="Enter a URL">' +
      '<label>Relation to the dataset: <i class="fas fa-info-circle swal-popover" data-content="A prespecified list of relations for common URLs or DOIs used in SPARC datasets. </br> The value in this field must be read as the \'relationship that this dataset has to the specified URL/DOI\'."rel="popover"data-placement="right"data-html="true"data-trigger="hover"></i></label><select id="DD-other-link-relation" class="swal2-input"><option value="Select">Select a relation</option><option value="IsCitedBy">IsCitedBy</option><option value="Cites">Cites</option><option value="IsSupplementTo">IsSupplementTo</option><option value="IsSupplementedBy">IsSupplementedBy</option><option value="IsContinuedByContinues">IsContinuedByContinues</option><option value="IsDescribedBy">IsDescribedBy</option><option value="Describes">Describes</option><option value="HasMetadata">HasMetadata</option><option value="IsMetadataFor">IsMetadataFor</option><option value="HasVersion">HasVersion</option><option value="IsVersionOf">IsVersionOf</option><option value="IsNewVersionOf">IsNewVersionOf</option><option value="IsPreviousVersionOf">IsPreviousVersionOf</option><option value="IsPreviousVersionOf">IsPreviousVersionOf</option><option value="HasPart">HasPart</option><option value="IsPublishedIn">IsPublishedIn</option><option value="IsReferencedBy">IsReferencedBy</option><option value="References">References</option><option value="IsDocumentedBy">IsDocumentedBy</option><option value="Documents">Documents</option><option value="IsCompiledBy">IsCompiledBy</option><option value="Compiles">Compiles</option><option value="IsVariantFormOf">IsVariantFormOf</option><option value="IsOriginalFormOf">IsOriginalFormOf</option><option value="IsIdenticalTo">IsIdenticalTo</option><option value="IsReviewedBy">IsReviewedBy</option><option value="Reviews">Reviews</option><option value="IsDerivedFrom">IsDerivedFrom</option><option value="IsSourceOf">IsSourceOf</option><option value="IsRequiredBy">IsRequiredBy</option><option value="Requires">Requires</option><option value="IsObsoletedBy">IsObsoletedBy</option><option value="Obsoletes">Obsoletes</option></select>' +
      '<label>Link description: <i class="fas fa-info-circle swal-popover" data-content="Provide a short description of the link."rel="popover"data-placement="right"data-html="true"data-trigger="hover"></i></label><textarea id="DD-other-description" class="swal2-textarea" placeholder="Enter a description"></textarea>',

    focusConfirm: false,
    confirmButtonText: "Add",
    cancelButtonText: "Cancel",
    customClass: "swal-content-additional-link",
    showCancelButton: true,
    width: "38rem",
    reverseButtons: window.reverseSwalButtons,
    heightAuto: false,
    backdrop: "rgba(0,0,0, 0.4)",
    didOpen: () => {
      $(".swal-popover").popover();
    },
    preConfirm: () => {
      var link = $("#DD-other-link").val();
      let confirm_btn = document.getElementsByClassName("swal2-confirm")[0];
      let cancel_btn = document.getElementsByClassName("swal2-cancel")[0];
      if (link === "") {
        Swal.showValidationMessage(`Please enter a link!`);
        confirm_btn.removeAttribute("disabled");
        cancel_btn.removeAttribute("disabled");
      } else {
        if (doiRegex.declared({ exact: true }).test(link) === true) {
          protocolLink = "DOI";
        } else {
          //check if link is valid
          if (validator.isURL(link) != true) {
            Swal.showValidationMessage(`Please enter a valid link`);
            confirm_btn.removeAttribute("disabled");
            cancel_btn.removeAttribute("disabled");
          } else {
            //link is valid url and check for 'doi' in link
            if (link.includes("doi")) {
              protocolLink = "DOI";
            } else {
              protocolLink = "URL";
            }
          }
        }
      }

      if ($("#DD-other-description").val() === "") {
        Swal.showValidationMessage(`Please enter a short description.`);
      }
      var duplicate = window.checkLinkDuplicate(link, document.getElementById("other-link-table-dd"));
      if (duplicate) {
        Swal.showValidationMessage(
          `Duplicate ${protocolLink}. The ${protocolLink} you entered is already added.`
        );
      }

      if ($("#DD-other-link-relation").val() === "Select") {
        Swal.showValidationMessage("Please select a link relation");
      }

      return [
        $("#DD-other-link").val(),
        protocolLink,
        $("#DD-other-link-relation").val(),
        $("#DD-other-description").val(),
      ];
    },
  });
  if (values) {
    window.addAdditionalLinktoTableDD(values[0], values[1], values[2], values[3]);
  }
};

window.checkLinkDuplicate = (link, table) => {
  var duplicate = false;
  var rowcount = table.rows.length;
  for (var i = 1; i < rowcount; i++) {
    var currentLink = table.rows[i].cells[1].innerText;
    if (currentLink === link) {
      duplicate = true;
      break;
    }
  }
  return duplicate;
};

const hideDescriptionForDOIs = () => {
  $("#DD-additional-link-description").val("");
  $("#DD-additional-link").val("");
  if ($("#DD-additional-link-type").val() === "Originating Article DOI") {
    $("#DD-additional-link-description").css("display", "none");
    $("#label-additional-link-description").css("display", "none");
  } else if ($("#DD-additional-link-type").val() === "Additional Link") {
    $("#DD-additional-link-description").css("display", "block");
    $("#label-additional-link-description").css("display", "block");
  }
};

const showAgeSection = (ev, div, type) => {
  var allDivsArr = [];
  if (type === "subjects") {
    allDivsArr = ["div-exact-age", "div-age-category", "div-age-range"];
  } else {
    allDivsArr = ["div-exact-age-samples", "div-age-category-samples", "div-age-range-samples"];
  }
  allDivsArr.splice(allDivsArr.indexOf(div), 1);
  if ($("#" + div).hasClass("hidden")) {
    $("#" + div).removeClass("hidden");
  }
  $(".age.ui").removeClass("positive active");
  $(ev).addClass("positive active");
  for (var divEle of allDivsArr) {
    $("#" + divEle).addClass("hidden");
  }
};

const readXMLScicrunch = (xml, type, curationMode) => {
  var parser = new DOMParser();
  var xmlDoc = parser.parseFromString(xml, "text/xml");
  var resultList = xmlDoc.getElementsByTagName("name"); // THE XML TAG NAME.
  var rrid = "";
  var res;

  for (var i = 0; i < resultList.length; i++) {
    if (resultList[i].childNodes[0].nodeValue === "Proper Citation") {
      rrid = resultList[i].nextSibling.childNodes[0].nodeValue;
      break;
    }
  }
  if (type === "subject") {
    if (rrid.trim() !== "") {
      if (curationMode == "free-form") {
        $("bootbox-subject-strain-RRID").val(rrid.trim());
      }

      if (curationMode == "guided") {
        guidedSetStrainRRID(rrid.trim());
      }
      res = true;
    } else {
      if (curationMode == "free-form") {
        $("bootbox-subject-strain-RRID").val("");
      }

      if (curationMode === "guided") {
        guidedSetStrainRRID("");
      }
      res = false;
    }
  } else {
    if (rrid.trim() !== "") {
      $("#bootbox-sample-strain-RRID").val(rrid.trim());
      res = true;
    } else {
      $("#bootbox-sample-strain-RRID").val("");
      res = false;
    }
  }
  return res;
};

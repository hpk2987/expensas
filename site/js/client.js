$(function() {
	$.get( "/getCuentas", function( data ) {
		data.forEach(function(entry){
			addCuentaDiv(entry);
		});
	});

	$("#addCuenta").ajaxForm({
		url: '/addCuenta', 
		dataType: 'json',
		success: function(data,status,xhr,form) { 
			addCuentaDiv(data);   			
    	}
	});
});

function addCuentaDiv(cuenta){
	$("#cuentas").append(
		"<div id=\"cuenta_"+cuenta._id+"\">"+
		cuenta.nombre+
		"<form id=\"cuenta_delete"+cuenta._id+"\" onSubmit=\"return confirm('Eliminar cuenta?')\">"+
		"<input type=\"hidden\" name=\"id\" value=\""+cuenta._id+"\">"+
		"<input type=\"submit\" value=\"Borrar\"></form></div>");

	$("#cuenta_delete"+cuenta._id).ajaxForm({
		url: '/removeCuenta',
		dataType: 'html',
		success: function(data,status,xhr,form){
			$("#cuenta_"+cuenta._id).remove();
		}
	});
}